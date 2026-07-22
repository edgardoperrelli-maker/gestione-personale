'use client';

import 'rrweb/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { canaleSessione, creaRicevitore, realtimeClient, type Chunk } from '@/lib/assistenza/transport';

type Props = { sid: string; staff: string; data: string; onClose: () => void };

/** Interfaccia minima del Replayer rrweb usata qui (evita `any`). */
type LiveReplayer = {
  addEvent: (event: unknown) => void;
  startLive: (baseTime?: number) => void;
  destroy?: () => void;
};
type RREvent = { type: number; timestamp: number; data?: { width?: number; height?: number } };

/**
 * Una sessione di assistenza (una card). Riceve gli eventi rrweb dell'operatore via broadcast
 * e li rigioca in DIRETTA (Replayer liveMode). Il replayer viene creato al PRIMO evento con
 * `startLive(ts - 1000)` ancorato al clock della SORGENTE: con `startLive()` senza argomento
 * un telefono col clock avanti rispetto al desktop schedula tutto "nel futuro" → schermo
 * bianco. Il viewport dell'operatore (es. 390×844) viene scalato alla larghezza del pannello.
 */
export default function SessionePanel({ sid, staff, data, onClose }: Props) {
  const [operatorePresente, setOperatorePresente] = useState(false);
  const [condivisione, setCondivisione] = useState(false);
  const [ricevuti, setRicevuti] = useState(0);
  const [errori, setErrori] = useState(0);
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  const [scala, setScala] = useState(1);
  const [hint, setHint] = useState('');

  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const replayerRef = useRef<LiveReplayer | null>(null);
  const pending = useRef<RREvent[]>([]);
  const initing = useRef(false);

  const aggiornaScala = useCallback((w: number) => {
    const host = hostRef.current;
    if (!host || w <= 0) return;
    setScala(Math.min(1, (host.clientWidth - 16) / w));
  }, []);

  const initReplayer = useCallback(async (primoTs: number) => {
    if (replayerRef.current || initing.current || !rootRef.current) return;
    initing.current = true;
    try {
      const rrweb = await import('rrweb');
      if (!rootRef.current) return;
      rootRef.current.innerHTML = '';
      const replayer = new rrweb.Replayer([], {
        liveMode: true,
        root: rootRef.current,
        mouseTail: false,
      });
      const live = replayer as unknown as LiveReplayer;
      live.startLive(primoTs - 1000); // ancorato al clock della sorgente, con buffer di rete
      replayerRef.current = live;
      for (const e of pending.current) {
        try { live.addEvent(e); } catch { setErrori((n) => n + 1); }
      }
      pending.current = [];
    } finally {
      initing.current = false;
    }
  }, []);

  const onEvent = useCallback((raw: unknown) => {
    const ev = raw as RREvent;
    setRicevuti((n) => n + 1);
    setCondivisione(true);
    // Meta event (type 4): porta il viewport della sorgente → scala il replay al pannello
    if (ev.type === 4 && ev.data?.width) {
      setVp({ w: ev.data.width, h: ev.data.height ?? 0 });
      aggiornaScala(ev.data.width);
    }
    if (replayerRef.current) {
      try { replayerRef.current.addEvent(ev); } catch { setErrori((n) => n + 1); }
    } else {
      pending.current.push(ev);
      void initReplayer(pending.current[0].timestamp);
    }
  }, [initReplayer, aggiornaScala]);

  useEffect(() => {
    const cli = realtimeClient();
    if (!cli) return;
    const ricevi = creaRicevitore(onEvent);
    const ch = cli.channel(canaleSessione(sid), {
      config: { broadcast: { self: false }, presence: { key: 'admin' } },
    });
    chRef.current = ch;

    ch.on('broadcast', { event: 'rr' }, ({ payload }) => ricevi(payload as Chunk));
    ch.on('broadcast', { event: 'start' }, () => setCondivisione(true));
    ch.on('broadcast', { event: 'stop' }, () => {
      setCondivisione(false);
      replayerRef.current?.destroy?.();
      replayerRef.current = null;
      pending.current = [];
      setRicevuti(0);
      setErrori(0);
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

    const onResize = () => { if (vpRef.current) aggiornaScala(vpRef.current.w); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      replayerRef.current?.destroy?.();
      replayerRef.current = null;
      cli.removeChannel(ch);
      chRef.current = null;
    };
  }, [sid, onEvent, aggiornaScala]);

  // ref-shadow del viewport per l'handler di resize (evita di riagganciare l'effect)
  const vpRef = useRef<{ w: number; h: number } | null>(null);
  vpRef.current = vp;

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
          {errori > 0 && <span className="text-[var(--brand-magenta)]">· errori {errori}</span>}
          <button type="button" onClick={onClose} className="text-[var(--brand-text-muted)]">✕</button>
        </div>
      </div>

      {/* area replay: il viewport sorgente viene scalato alla larghezza del pannello */}
      <div ref={hostRef} className="relative max-h-[70vh] min-h-[320px] overflow-auto bg-[var(--brand-bg)] p-2">
        <div style={vp ? { height: Math.round(vp.h * scala), width: Math.round(vp.w * scala), margin: '0 auto' } : undefined}>
          <div
            ref={rootRef}
            style={vp ? { transform: `scale(${scala})`, transformOrigin: 'top left', width: vp.w, height: vp.h } : undefined}
          />
        </div>
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
