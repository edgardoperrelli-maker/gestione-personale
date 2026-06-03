'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { aggregateRapportiniKpi, type RapportiniKpi, type RapportinoKpiRow } from '@/lib/dashboard/rapportiniKpi';
import { addDaysIso } from '@/lib/dashboard/addDaysIso';

function todayRomeIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function formatGiorno(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

type Tile = { label: string; value: number; className: string };

export default function RapportiniKpi() {
  const [giorno, setGiorno] = useState<string>(todayRomeIso());
  const [kpi, setKpi] = useState<RapportiniKpi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/mappa/rapportini/riepilogo?from=${giorno}&to=${giorno}`);
        const data = await res.json();
        const rows = (Array.isArray(data) ? data : []) as RapportinoKpiRow[];
        if (active) setKpi(aggregateRapportiniKpi(rows, todayRomeIso()));
      } catch {
        if (active) setKpi({ total: 0, inviato: 0, valido: 0, scaduto: 0, nonConsegnati: 0 });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [giorno]);

  const tiles: Tile[] = kpi
    ? [
        { label: 'Inviati', value: kpi.inviato, className: 'bg-[var(--success-soft)] text-[var(--success)]' },
        { label: 'In corso', value: kpi.valido, className: 'bg-[var(--warning-soft)] text-[var(--warning)]' },
        { label: 'Scaduti', value: kpi.scaduto, className: 'bg-[var(--danger-soft)] text-[var(--danger)]' },
        { label: 'Non consegnati', value: kpi.nonConsegnati, className: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' },
      ]
    : [];

  const isOggi = giorno === todayRomeIso();

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Stato rapportini</h2>
        <Link
          href="/hub/mappa?vista=riepilogo"
          className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
        >
          Riepilogo completo →
        </Link>
      </div>

      {/* Navigatore giorno */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setGiorno((g) => addDaysIso(g, -1))}
          className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)]"
          aria-label="Giorno precedente"
        >
          ◀
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize text-[var(--brand-text-main)]">{formatGiorno(giorno)}</span>
          {!isOggi && (
            <button
              type="button"
              onClick={() => setGiorno(todayRomeIso())}
              className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-primary)]"
            >
              Oggi
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setGiorno((g) => addDaysIso(g, 1))}
          className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)]"
          aria-label="Giorno successivo"
        >
          ▶
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Caricamento…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl px-3 py-3 ${t.className}`}>
                <p className="text-2xl font-bold tabular-nums">{t.value}</p>
                <p className="text-xs font-medium opacity-90">{t.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs capitalize text-[var(--brand-text-muted)]">
            {kpi?.total ?? 0} rapportini per {formatGiorno(giorno)}.
            {kpi && kpi.nonConsegnati > 0 && (
              <span className="font-semibold text-[var(--brand-primary)]"> {kpi.nonConsegnati} da sollecitare.</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
