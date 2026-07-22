'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { canaleSessione, creaRicevitore, realtimeClient } from '@/lib/assistenza/transport';

type Props = { sid: string; staff: string; data: string; onClose: () => void };

/** Interfaccia minima del Replayer rrweb usata qui (evita `any`). */
type LiveReplayer = {
  addEvent: (event: unknown) => void;
  startLive: (baseTime?: number) => void;
  destroy?: () => void;
};

/**
 * Una sessione di assistenza (una card). Riceve gli eventi rrweb dell'operatore via broadcast
 * e li rigioca in DIRETTA con il Replayer rrweb in liveMode (pattern canonico: Replayer vuoto +
 * startLive() + addEvent per ogni evento). Ricostruzione fedele del rapportino, inclusi errori.
 * Sola lettura; unico canale di ritorno: un "suggerimento" testuale.
 */
export default function SessionePanel({ sid, staff, data, onClose }: Props) {
  const [operatorePresente, setOperatorePresente] = useState(false);
  const [condivisione, setCondivisione] = useState(false);
  const [ricevuti, setRicevuti] = useState(0);
  const [hint, setHint] = useState('');

  const rootRef = useRef<HTMLDivElement | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const replayerRef = useRef<LiveReplayer | null>(null);
  const pending = useRef<unknown[]>([]);
  const rrwebMod = useRef<typeof import('rrweb') | null>(null);
  const initing = useRef(false);

  const initReplayer = useCallback(async () => {
    if (replayerRef.current || initing.current || !rootRef.current) return;
    initing.current = true;
    try {
      if (!rrwebMod.current) rrwebMod.current = await import('rrweb');
      if (!rootRef.current) return;
      rootRef.current.innerHTML = '';
      const replayer = new rrwebMod.current.Replayer([], {
        liveMode: true,
        root: rootRef.current,
        mouseTail: false,
      });
      const live = replayer as unknown as LiveReplayer;
      live.startLive();
      replayerRef.current = live;
      // svuota gli eventi arrivati prima che il player fosse pronto
      for (const e of pending.current) { try { live.addEvent(e); } catch { /* no-op */ } }
      pending.current = [];
    } finally {
      initing.current = false;
    }
  }, []);

  const onEvent = useCallback((raw: unknown) => {
    setRicevuti((n) => n + 1);
    setCondivisione(true);
    if (replayerRef.current) {
      try { replayerRef.current.addEvent(raw); } catch { /* no-op */ }
    } else {
      pending.current.push(raw);
      void initReplayer();
    }
  }, [initReplayer]);

  useEffect(() => {
    const cli = realtimeClient();
    if (!cli) return;
    void initReplayer();
    const ricevi = creaRicevitore(onEvent);
    const ch = cli.channel(canaleSessione(sid), {
      config: { broadcast: { self: false }, presence: { key: 'admin' } },
    });
    chRef.current = ch;

    ch.on('broadcast', { event: 'rr' }, ({ payload }) => ricevi(payload as { eid: string; i: number; n: number; s: string }));
    ch.on('broadcast', { event: 'start' }, () => setCondivisione(true));
    ch.on('broadcast', { event: 'stop' }, () => {
      setCondivisione(false);
      replayerRef.current?.destroy?.();
      replayerRef.current = null;
      pending.current = [];
      setRicevuti(0);
      if (rootRef.current) rootRef.current.innerHTML = '';
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      setOperatorePresente(Object.values(st).flat().some((m) => (m as { role?: string })?.role === 'operatore'));
    });

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role: 'admin' });
        ch.send({ type: 'broadcast', event: 'richiesta_admin', payload: {} });
      }
    });

    return () => {
      replayerRef.current?.destroy?.();
      replayerRef.current = null;
      cli.removeChannel(ch);
      chRef.current = null;
    };
  }, [sid, onEvent, initReplayer]);

  const inviaHint = useCallback(() => {
    const t = hint.trim();
    if (!t) return;
    chRef.current?.send({ type: 'broadcast', event: 'hint', payload: { text: t } });
    setHint('');
  }, [hint]);

  const richiediDiNuovo = useCallback(() => {
    chRef.current?.send({ type: 'broadcast', event: 'richiesta_admin', payload: {} });
  }, []);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--brand-border)] px-3 py-2">
        <div className="text-sm">
          <b>{staff}</b> <span className="text-[var(--brand-text-muted)]">· {data}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1" style={{ color: operatorePresente ? 'var(--brand-green)' : 'var(--brand-text-muted)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: operatorePresente ? 'var(--brand-green)' : 'var(--brand-text-muted)' }} />
            {operatorePresente ? 'operatore in linea' : 'operatore offline'}
          </span>
          <span className="text-[var(--brand-text-muted)]">· eventi {ricevuti}</span>
          <button type="button" onClick={onClose} className="text-[var(--brand-text-muted)]">✕</button>
        </div>
      </div>

      {/* area replay */}
      <div className="relative flex max-h-[70vh] min-h-[320px] justify-center overflow-auto bg-[var(--brand-bg)]">
        <div ref={rootRef} className="assist-replay" />
        {!condivisione && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-sm text-[var(--brand-text-muted)]">
              {operatorePresente
                ? 'In attesa che l\'operatore accetti la condivisione…'
                : 'Operatore non in linea. Aprirà l\'assistenza dal suo rapportino.'}
            </div>
            {operatorePresente && (
              <button type="button" onClick={richiediDiNuovo}
                className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold">Richiedi di nuovo</button>
            )}
          </div>
        )}
      </div>

      {/* guida */}
      <div className="flex items-center gap-2 border-t border-[var(--brand-border)] px-3 py-2">
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') inviaHint(); }}
          placeholder="Manda un suggerimento all'operatore…"
          className="flex-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-1.5 text-sm outline-none"
        />
        <button type="button" onClick={inviaHint}
          className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)]">Invia</button>
      </div>
    </div>
  );
}
