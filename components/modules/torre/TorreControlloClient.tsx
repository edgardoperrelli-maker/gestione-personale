'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { coloreStato, raggruppaPerOperatore, type TonoTorre } from '@/lib/interventi/torreView';
import { labelStato } from '@/lib/interventi/interventiView';

const TorreMappa = dynamic(() => import('./TorreMappa'), { ssr: false });

export type TorreIntervento = {
  id: string;
  odl: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  lat: number | null;
  lng: number | null;
  staff_id: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
  fascia_oraria: string | null;
};

const TONO: Record<TonoTorre, { fg: string; dot: string; label: string }> = {
  ok: { fg: 'var(--success)', dot: '#22c55e', label: 'Fatto' },
  ko: { fg: 'var(--danger)', dot: '#ef4444', label: 'Non fatto' },
  attesa: { fg: 'var(--brand-text-main)', dot: '#fbbf24', label: 'Da fare' },
  corso: { fg: 'var(--brand-text-main)', dot: '#38bdf8', label: 'In corso' },
  annullato: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Annullato' },
  da_assegnare: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Da assegnare' },
};

export default function TorreControlloClient({
  data,
  interventi,
  operatori,
}: {
  data: string;
  interventi: TorreIntervento[];
  operatori: { id: string; display_name: string }[];
}) {
  const [items, setItems] = useState<TorreIntervento[]>(interventi);
  const [live, setLive] = useState(false);
  const [selStaff, setSelStaff] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel('torre-interventi')
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
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data]);

  const gruppi = raggruppaPerOperatore(items, operatori);
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

  // La mappa mostra gli interventi dell'operatore selezionato (filtro), o tutti.
  const itemsMappa = selStaff ? items.filter((i) => i.staff_id === selStaff) : items;
  const nomeSel = selStaff ? gruppi.find((g) => g.operatore.id === selStaff)?.operatore.display_name : null;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Torre di controllo
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            {data} · {items.length} interventi · ✅ {totali.fatti} · ❌ {totali.nonFatti} · ⏳ {totali.daFare}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor: live ? 'var(--success-soft)' : 'var(--brand-surface-muted)',
            color: live ? 'var(--success)' : 'var(--brand-text-muted)',
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: live ? '#22c55e' : '#9ca3af' }} />
          {live ? 'Live' : 'Non connesso'}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Colonna sinistra: operatori come filtri, scrollabile */}
        <div className="space-y-2.5 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
          {gruppi.map((g) => {
            const sel = selStaff === g.operatore.id;
            return (
              <button
                key={g.operatore.id ?? 'na'}
                type="button"
                onClick={() => setSelStaff((p) => (p === g.operatore.id ? null : g.operatore.id))}
                className="w-full rounded-2xl border p-3 text-left transition hover:border-[var(--brand-primary)]"
                style={{
                  borderColor: sel ? 'var(--brand-primary)' : 'var(--brand-border)',
                  backgroundColor: sel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                  boxShadow: sel ? '0 0 0 1px var(--brand-primary)' : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                    {g.operatore.display_name}
                  </h2>
                  <div className="shrink-0 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                    {g.conteggi.assegnati}⏳ · {g.conteggi.fatti}✅ · {g.conteggi.nonFatti}❌
                  </div>
                </div>

                {g.interventi.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {g.interventi.map((it) => {
                      const tono = TONO[coloreStato(it.stato, it.esito)];
                      return (
                        <li key={it.id} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tono.dot }} />
                          <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--brand-text-main)' }}>
                            {it.nominativo ?? it.odl ?? 'Intervento'}
                            {it.comune ? ` · ${it.comune}` : ''}
                          </span>
                          <span className="shrink-0 text-xs" style={{ color: tono.fg }}>
                            {it.stato === 'completato' ? tono.label : labelStato(it.stato)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </button>
            );
          })}
        </div>

        {/* Colonna destra: mappa filtrata, resta visibile mentre scorri */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:h-fit">
          {selStaff && (
            <div
              className="flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
            >
              <span className="font-semibold">Filtro mappa: {nomeSel}</span>
              <button type="button" onClick={() => setSelStaff(null)} className="font-medium underline">
                Mostra tutti
              </button>
            </div>
          )}
          <TorreMappa interventi={itemsMappa} />
        </div>
      </div>
    </main>
  );
}
