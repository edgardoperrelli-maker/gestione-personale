'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  canaleSessione,
  creaMittente,
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

  const [instabile, setInstabile] = useState(false);
  const chRef = useRef<RealtimeChannel | null>(null);
  const recRef = useRef<RecordApi | null>(null);
  const mittenteRef = useRef<ReturnType<typeof creaMittente> | null>(null);
  const statoRef = useRef<Stato>('idle');
  statoRef.current = stato;

  /* ── avvio/stop registrazione rrweb ────────────────────────────────── */
  const avviaRegistrazione = useCallback(async () => {
    if (recRef.current || !chRef.current) return;
    const ch = chRef.current;
    if (!mittenteRef.current) mittenteRef.current = creaMittente(ch, () => setInstabile(true));
    const mittente = mittenteRef.current;
    const rrweb = await import('rrweb');
    const stop = rrweb.record({
      emit: (event) => mittente.invia(event),
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
      if (statoRef.current === 'attiva') {
        // già in condivisione: un admin (ri)entrato ha bisogno di start + snapshot fresco
        ch.send({ type: 'broadcast', event: 'start', payload: { staff, data } });
        recRef.current?.takeFullSnapshot();
      } else {
        setRichiestaAdmin(true);
      }
    });
    ch.on('broadcast', { event: 'hint' }, ({ payload }) => {
      setHint((payload as { text?: string }).text ?? '');
      window.setTimeout(() => setHint(null), 5000);
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      const admin = Object.values(st).flat().some((m) => (m as { role?: string })?.role === 'admin');
      setAdminPresente(admin);
      // admin appena entrato mentre condividiamo → ripeti start + full-snapshot per allinearlo
      if (admin && statoRef.current === 'attiva') {
        ch.send({ type: 'broadcast', event: 'start', payload: { staff, data } });
        recRef.current?.takeFullSnapshot();
      }
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
      mittenteRef.current = null;
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
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--primary-text)] shadow-[var(--shadow-lg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        style={stato === 'attiva' ? { borderColor: 'var(--status-ko)' } : undefined}
      >
        {stato === 'attiva' ? (
          <span className="relative flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" style={{ background: 'var(--status-ko)' }} />
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: 'var(--status-ko)' }} />
          </span>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4" />
            <path d="M6.3 6.3l2.9 2.9M14.8 14.8l2.9 2.9M6.3 17.7l2.9-2.9M14.8 9.2l2.9-2.9" />
          </svg>
        )}
      </button>

      {aperto && (
        <div className="fixed bottom-20 left-4 z-40 w-[min(88vw,320px)] rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--brand-text-main)]">Assistenza remota</div>
            <button
              type="button"
              onClick={() => setAperto(false)}
              aria-label="Chiudi"
              className="rounded-[var(--radius-sm)] px-1 text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              ✕
            </button>
          </div>

          {!env && (
            <p className="mt-2 text-xs text-[var(--status-ko)]">Servizio non disponibile su questo ambiente.</p>
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
                className="mt-3 w-full rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:opacity-40"
              >
                Chiedi assistenza
              </button>
            </>
          )}

          {stato !== 'idle' && (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--status-ko)]/50 bg-[var(--status-ko-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-text-main)]">
                  {stato === 'attiva' && (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: 'var(--status-ko)' }} aria-hidden />
                  )}
                  {stato === 'attiva' ? (adminPresente ? 'Assistenza in corso' : 'In condivisione — attendo il back office') : 'Richiesta inviata…'}
                </span>
                <button
                  type="button"
                  onClick={termina}
                  className="rounded-[var(--radius-sm)] text-xs font-semibold text-[var(--status-ko)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  Interrompi
                </button>
              </div>
              {instabile && (
                <div className="mt-1 text-[11px] text-[var(--status-warn)]">Connessione instabile: alcuni aggiornamenti potrebbero non arrivare al back office.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* toast hint dal back office */}
      {hint && (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-2 text-sm text-[var(--brand-text-main)] shadow-[var(--shadow-lg)]">
          {hint}
        </div>
      )}

      {/* MODALE: richiesta dal back office — compare da sola, non silenziosa */}
      {richiestaAdmin && stato !== 'attiva' && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'var(--overlay)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assistenza-richiesta-title"
        >
          <div className="w-[min(92vw,360px)] rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-[var(--shadow-lg)]">
            <div id="assistenza-richiesta-title" className="text-base font-semibold text-[var(--brand-text-main)]">Richiesta di assistenza</div>
            <div className="mt-1 text-sm text-[var(--brand-text-muted)]">
              Il back office chiede di vedere questo rapportino per aiutarti. Vedrà solo questa schermata, in sola lettura.
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { setAperto(true); void attiva(); }}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">Accetto</button>
              <button type="button" onClick={() => setRichiestaAdmin(false)}
                className="rounded-[var(--radius-md)] border border-[var(--brand-border-strong)] px-3 py-2.5 text-sm font-semibold text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">Rifiuto</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
