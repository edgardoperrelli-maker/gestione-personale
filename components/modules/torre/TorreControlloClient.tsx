'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, rigaDettaglio, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
import { labelStato } from '@/lib/interventi/interventiView';
import { useInterventiFeed, type TorreIntervento } from '@/lib/interventi/useInterventiFeed';

export type { TorreIntervento };

const TorreMappa = dynamic(() => import('./TorreMappa'), { ssr: false });

const TONO: Record<TonoTorre, { fg: string; dot: string; label: string; bg: string }> = {
  ok: { fg: 'var(--success)', dot: '#22c55e', label: 'Fatto', bg: 'var(--success-soft)' },
  ko: { fg: 'var(--danger)', dot: '#ef4444', label: 'Non fatto', bg: 'var(--danger-soft)' },
  attesa: { fg: 'var(--brand-text-main)', dot: '#fbbf24', label: 'Da fare', bg: 'var(--warning-soft)' },
  corso: { fg: 'var(--brand-text-main)', dot: '#38bdf8', label: 'In corso', bg: 'rgba(56,189,248,0.12)' },
  annullato: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Annullato', bg: 'var(--brand-surface-muted)' },
  da_assegnare: { fg: 'var(--brand-text-muted)', dot: '#9ca3af', label: 'Da assegnare', bg: 'var(--brand-surface-muted)' },
};

export default function TorreControlloClient({
  data,
  interventi,
  operatori,
  territori,
}: {
  data: string;
  interventi: TorreIntervento[];
  operatori: { id: string; display_name: string }[];
  territori: { id: string; name: string }[];
}) {
  const { items, live, lastUpdate, refresh } = useInterventiFeed(data, {
    channelPrefix: 'torre',
    initialItems: interventi,
  });
  const [selStaff, setSelStaff] = useState<string | null>(null);
  const [selTerr, setSelTerr] = useState<string | null>(null);
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const risincronizza = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/interventi/risincronizza?data=${data}`, { method: 'POST' });
      if (res.ok) await refresh();
    } catch {
      /* ignora: l'utente può ritentare */
    } finally {
      setSyncing(false);
    }
  };

  const itemsTerr = filtraInterventi(items, selTerr, null);
  const gruppi = raggruppaPerOperatore(itemsTerr, operatori);
  const gruppiVisibili = operatoriVisibili(gruppi, selTerr);
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
  const itemsMappa = filtraInterventi(items, selTerr, selStaff);
  const nomeSel = selStaff
    ? gruppi.find((g) => (g.operatore.id ?? SENTINELLA_NON_ASSEGNATI) === selStaff)?.operatore.display_name
    : null;

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
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && router.push(`/hub/torre?data=${e.target.value}`)}
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
          <button
            type="button"
            onClick={() => void risincronizza()}
            disabled={syncing}
            className="rounded-xl border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--brand-primary)] disabled:opacity-60"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            title="Ri-aggancia le voci e riapplica gli esiti dei rapportini già compilati"
          >
            {syncing ? 'Sincronizzo…' : 'Risincronizza esiti'}
          </button>
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
          {lastUpdate && (
            <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              agg. {lastUpdate}
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Colonna sinistra: operatori come filtri, scrollabile */}
        <div className="space-y-2.5 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
          {territori.length > 0 && (
            <select
              value={selTerr ?? ''}
              onChange={(e) => {
                setSelTerr(e.target.value || null);
                setSelStaff(null);
              }}
              className="w-full rounded-2xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            >
              <option value="">Tutti i territori</option>
              {territori.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {gruppiVisibili.map((g) => {
            const opKey = g.operatore.id ?? SENTINELLA_NON_ASSEGNATI;
            const sel = selStaff === opKey;
            return (
              <button
                key={opKey}
                type="button"
                onClick={() => setSelStaff((p) => (p === opKey ? null : opKey))}
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

          {/* Dettaglio lavori (operatore selezionato o tutti): righe colorate, live. */}
          <section className="rounded-2xl border" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}>
            <header
              className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
            >
              <span className="truncate">{nomeSel ? `Dettaglio lavori — ${nomeSel}` : 'Tutti i lavori'}</span>
              <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>{itemsMappa.length}</span>
            </header>
            <ul className="max-h-[360px] divide-y divide-[var(--brand-border)] overflow-y-auto">
              {itemsMappa.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessun lavoro.</li>
              ) : (
                itemsMappa.map((it) => {
                  const tono = TONO[coloreStato(it.stato, it.esito)];
                  const ko = it.stato === 'completato' && it.esito !== 'eseguito_positivo';
                  const riga = rigaDettaglio(it);
                  return (
                    <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ backgroundColor: tono.bg }}>
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 self-start rounded-full" style={{ backgroundColor: tono.dot }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: 'var(--brand-text-main)' }}>{riga.primario}</div>
                        {riga.secondario && (
                          <div className="truncate text-xs" style={{ color: 'var(--brand-text-muted)' }}>{riga.secondario}</div>
                        )}
                        {ko && it.esito_motivo && (
                          <div className="truncate text-xs" style={{ color: tono.fg }}>{it.esito_motivo}</div>
                        )}
                      </div>
                      <span className="shrink-0 self-start text-xs font-medium" style={{ color: tono.fg }}>
                        {it.stato === 'completato' ? tono.label : labelStato(it.stato)}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
