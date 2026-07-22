'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  canaleSessione,
  inviaEvento,
  LOBBY,
  realtimeClient,
  type Richiesta,
} from '@/lib/assistenza/transport';

type Props = { sessionId: string; staff: string; data: string };
type Stato = 'idle' | 'in_attesa' | 'attiva';

type RecordApi = {
  stop: () => void;
  takeFullSnapshot: () => void;
};

/**
 * Entry dell'assistenza remota lato OPERATORE, montata sulla pagina rapportino `/r/[token]`.
 * L'operatore può CHIEDERE assistenza al back office, oppure ACCETTARE una richiesta che
 * arriva dal back office (previa accettazione). Quando la sessione è attiva, registra il DOM
 * del rapportino con rrweb (caricato on-demand) e lo trasmette in sola lettura. Nessun dato
 * viene salvato sul database: il canale è effimero.
 */
export default function OperatoreAssistenza({ sessionId, staff, data }: Props) {
  const [aperto, setAperto] = useState(false);
  const [stato, setStato] = useState<Stato>('idle');
  const [adminPresente, setAdminPresente] = useState(false);
  const [richiestaAdmin, setRichiestaAdmin] = useState(false);
  const [oscura, setOscura] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [connesso, setConnesso] = useState(false);

  const chRef = useRef<RealtimeChannel | null>(null);
  const recRef = useRef<RecordApi | null>(null);
  const seq = useRef({ n: 0 });
  const statoRef = useRef<Stato>('idle');
  statoRef.current = stato;

  /* ── avvio/stop registrazione rrweb ────────────────────────────────── */
  const avviaRegistrazione = useCallback(async () => {
    if (recRef.current || !chRef.current) return;
    const ch = chRef.current;
    const rrweb = await import('rrweb');
    const stop = rrweb.record({
      emit: (event) => inviaEvento(ch, event, seq.current),
      inlineStylesheet: true,
      collectFonts: false,
      recordCanvas: false,
      maskAllInputs: oscura,
      sampling: { mousemove: false, scroll: 150, input: 'last' },
    });
    recRef.current = {
      stop: () => stop?.(),
      takeFullSnapshot: () => {
        try {
          rrweb.record.takeFullSnapshot(true);
        } catch {
          /* no-op */
        }
      },
    };
  }, [oscura]);

  const fermaRegistrazione = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const attiva = useCallback(async () => {
    setStato('attiva');
    setRichiestaAdmin(false);
    await avviaRegistrazione();
    chRef.current?.send({ type: 'broadcast', event: 'start', payload: { staff, data } });
  }, [avviaRegistrazione, staff, data]);

  const termina = useCallback(() => {
    fermaRegistrazione();
    setStato('idle');
    chRef.current?.send({ type: 'broadcast', event: 'stop', payload: {} });
    const cli = realtimeClient();
    // ritira l'eventuale richiesta in lobby
    cli?.channel(LOBBY).send({ type: 'broadcast', event: 'ritira', payload: { sid: sessionId } });
  }, [fermaRegistrazione, sessionId]);

  /* ── connessione al canale di sessione ─────────────────────────────── */
  useEffect(() => {
    const cli = realtimeClient();
    if (!cli) return;
    const ch = cli.channel(canaleSessione(sessionId), {
      config: { broadcast: { self: false }, presence: { key: 'operatore' } },
    });
    chRef.current = ch;

    ch.on('broadcast', { event: 'richiesta_admin' }, () => {
      if (statoRef.current !== 'attiva') setRichiestaAdmin(true);
    });
    ch.on('broadcast', { event: 'hint' }, ({ payload }) => {
      setHint((payload as { text?: string }).text ?? '');
      window.setTimeout(() => setHint(null), 5000);
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      const admin = Object.values(st).flat().some((m) => (m as { role?: string })?.role === 'admin');
      setAdminPresente(admin);
      // admin appena entrato mentre condividiamo → nuovo full-snapshot per allinearlo
      if (admin && statoRef.current === 'attiva') recRef.current?.takeFullSnapshot();
    });

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnesso(true);
        ch.track({ role: 'operatore', staff, data });
      }
    });

    return () => {
      fermaRegistrazione();
      cli.removeChannel(ch);
      chRef.current = null;
    };
  }, [sessionId, staff, data, fermaRegistrazione]);

  /* ── operatore chiede assistenza (→ lobby back office) ─────────────── */
  const chiedi = useCallback(() => {
    const cli = realtimeClient();
    if (!cli) return;
    const rich: Richiesta = { sid: sessionId, staff, data, at: Date.now() };
    const lobby = cli.channel(LOBBY);
    lobby.subscribe((s) => {
      if (s === 'SUBSCRIBED') lobby.send({ type: 'broadcast', event: 'richiesta', payload: rich });
    });
    setStato('in_attesa');
    setAperto(true);
    void attiva(); // inizia subito a condividere: l'admin vedrà appena apre la sessione
  }, [sessionId, staff, data, attiva]);

  const env = realtimeClient() !== null;

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-label="Assistenza remota"
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-lg"
        style={stato === 'attiva' ? { borderColor: 'var(--brand-magenta)' } : undefined}
      >
        <span className="text-xl" aria-hidden>{stato === 'attiva' ? '🔴' : '🛟'}</span>
      </button>

      {aperto && (
        <div className="fixed bottom-20 left-4 z-40 w-[min(88vw,320px)] rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Assistenza remota</div>
            <button type="button" onClick={() => setAperto(false)} className="text-[var(--brand-text-muted)]">✕</button>
          </div>

          {!env && (
            <p className="mt-2 text-xs text-[var(--brand-magenta)]">Servizio non disponibile su questo ambiente.</p>
          )}

          {stato === 'idle' && !richiestaAdmin && (
            <>
              <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                Fai vedere questo rapportino al back office per farti aiutare. Vedono solo questa schermata.
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={oscura} onChange={(e) => setOscura(e.target.checked)} className="h-4 w-4" />
                Oscura i campi compilati
              </label>
              <button
                type="button"
                onClick={chiedi}
                disabled={!env || !connesso}
                className="mt-3 w-full rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-40"
              >
                Chiedi assistenza
              </button>
            </>
          )}

          {richiestaAdmin && stato !== 'attiva' && (
            <div className="mt-3 rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)]/40 p-3">
              <div className="text-sm font-semibold">Il back office chiede di assisterti</div>
              <div className="mt-0.5 text-xs text-[var(--brand-text-muted)]">Vedrà solo questa schermata, in sola lettura.</div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={attiva} className="flex-1 rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)]">Accetto</button>
                <button type="button" onClick={() => setRichiestaAdmin(false)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm">No</button>
              </div>
            </div>
          )}

          {stato !== 'idle' && (
            <div className="mt-3 rounded-lg border border-[var(--brand-magenta)]/50 bg-[var(--brand-magenta)]/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {stato === 'attiva' ? (adminPresente ? '🔴 Assistenza in corso' : '🔴 In condivisione — attendo il back office') : '⏳ Richiesta inviata…'}
                </span>
                <button type="button" onClick={termina} className="text-xs font-semibold text-[var(--brand-magenta)]">Interrompi</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* toast hint dal back office */}
      {hint && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--brand-gold)]/60 bg-[var(--brand-surface)] px-4 py-2 text-sm shadow-lg">
          💡 {hint}
        </div>
      )}
    </>
  );
}
