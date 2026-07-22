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
type RREvent = { type: number; timestamp: number };

/**
 * Una sessione di assistenza (una card). Riceve gli eventi rrweb dell'operatore via broadcast
 * e li rigioca in DIRETTA con il Replayer rrweb (liveMode) — ricostruzione fedele del rapportino,
 * inclusi errori/validazioni. In sola lettura; l'unico canale di ritorno è un "suggerimento" testuale.
 */
export default function SessionePanel({ sid, staff, data, onClose }: Props) {
  const [operatorePresente, setOperatorePresente] = useState(false);
  const [condivisione, setCondivisione] = useState(false);
  const [hint, setHint] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const replayerRef = useRef<LiveReplayer | null>(null);
  const initBuf = useRef<RREvent[]>([]);
  const rrwebMod = useRef<typeof import('rrweb') | null>(null);

  const onEvent = useCallback(async (raw: unknown) => {
    const event = raw as RREvent;
    if (replayerRef.current) {
      try { replayerRef.current.addEvent(event); } catch { /* no-op */ }
      return;
    }
    // in attesa del primo FullSnapshot (type 2) preceduto da un Meta (type 4)
    initBuf.current.push(event);
    if (event.type !== 2) return;
    const buf = initBuf.current;
    let metaIdx = -1;
    for (let i = buf.length - 1; i >= 0; i -= 1) { if (buf[i].type === 4) { metaIdx = i; break; } }
    if (metaIdx < 0) return; // manca il Meta, aspetta il prossimo full-snapshot
    const evs = buf.slice(metaIdx);
    initBuf.current = [];
    if (!rrwebMod.current) rrwebMod.current = await import('rrweb');
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = '';
    try {
      const replayer = new rrwebMod.current.Replayer(evs as unknown as [], {
        liveMode: true,
        root,
        mouseTail: false,
      });
      const live = replayer as unknown as LiveReplayer;
      live.startLive(evs[0]?.timestamp);
      replayerRef.current = live;
    } catch {
      /* init fallita: verrà ritentata al prossimo full-snapshot */
      initBuf.current = [];
    }
  }, []);

  useEffect(() => {
    const cli = realtimeClient();
    if (!cli) return;
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
      initBuf.current = [];
      if (rootRef.current) rootRef.current.innerHTML = '';
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      setOperatorePresente(Object.values(st).flat().some((m) => (m as { role?: string })?.role === 'operatore'));
    });

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role: 'admin' });
        // invita l'operatore ad accettare (se non sta già condividendo)
        ch.send({ type: 'broadcast', event: 'richiesta_admin', payload: {} });
      }
    });

    return () => {
      replayerRef.current?.destroy?.();
      replayerRef.current = null;
      cli.removeChannel(ch);
      chRef.current = null;
    };
  }, [sid, onEvent]);

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
