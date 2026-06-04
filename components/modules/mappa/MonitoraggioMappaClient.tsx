'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { coloreStato } from '@/lib/interventi/torreView';
import type { TorreIntervento } from '@/components/modules/torre/TorreControlloClient';

const TorreMappa = dynamic(() => import('@/components/modules/torre/TorreMappa'), { ssr: false });

function oggiRoma(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function oraIt(): string {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const LEGENDA: Array<{ dot: string; label: string }> = [
  { dot: '#22c55e', label: 'Fatto' },
  { dot: '#ef4444', label: 'Non fatto' },
  { dot: '#fbbf24', label: 'Da fare' },
  { dot: '#38bdf8', label: 'In corso' },
  { dot: '#9ca3af', label: 'Annullato' },
];

export default function MonitoraggioMappaClient() {
  const [data, setData] = useState(oggiRoma());
  const [items, setItems] = useState<TorreIntervento[]>([]);
  const [live, setLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/interventi/giorno?data=${data}`, { cache: 'no-store' });
      if (res.status === 403) { setErrore('Accesso riservato agli admin.'); setItems([]); return; }
      if (!res.ok) return;
      const json = (await res.json()) as { interventi?: TorreIntervento[] };
      setItems(json.interventi ?? []);
      setErrore(null);
      setLastUpdate(oraIt());
    } catch {
      /* errore di rete: ritenta al prossimo giro */
    }
  }, [data]);

  // Fetch iniziale + a ogni cambio data
  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime su interventi del giorno (stesso pattern della torre)
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`monitoraggio-${data}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventi', filter: `data=eq.${data}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id?: string } | null)?.id;
              return oldId ? prev.filter((x) => x.id !== oldId) : prev;
            }
            const next = payload.new as TorreIntervento;
            if (!next?.id) return prev;
            const idx = prev.findIndex((x) => x.id === next.id);
            if (idx === -1) return [...prev, next];
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          });
          setLastUpdate(oraIt());
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, [data]);

  // Polling 5 min, in pausa quando la scheda è in background
  useEffect(() => {
    const INTERVAL = 5 * 60 * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refresh(), INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { void refresh(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const totali = items.reduce(
    (acc, it) => {
      const t = coloreStato(it.stato, it.esito);
      if (t === 'ok') acc.fatti += 1;
      else if (t === 'ko') acc.nonFatti += 1;
      else if (t === 'attesa') acc.daFare += 1;
      return acc;
    },
    { fatti: 0, nonFatti: 0, daFare: 0 },
  );

  return (
    <main className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Monitoraggio oggi
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            {data} · {items.length} interventi · ✅ {totali.fatti} · ❌ {totali.nonFatti} · ⏳ {totali.daFare}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Seleziona data"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="rounded-xl border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
          />
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--brand-primary)]"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            title="Ricarica subito gli interventi del giorno"
          >
            Aggiorna ora
          </button>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: live ? 'var(--success-soft)' : 'var(--brand-surface-muted)',
              color: live ? 'var(--success)' : 'var(--brand-text-muted)',
            }}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: live ? '#22c55e' : '#9ca3af' }} />
            {live ? 'Live' : 'Non connesso'}
          </span>
          {lastUpdate && (
            <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>agg. {lastUpdate}</span>
          )}
        </div>
      </header>

      {errore ? (
        <div
          className="rounded-2xl border px-4 py-6 text-center text-sm"
          style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-muted)' }}
        >
          {errore}
        </div>
      ) : (
        <>
          <TorreMappa interventi={items} />
          <div className="flex flex-wrap items-center gap-3 px-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            {LEGENDA.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.dot }} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
