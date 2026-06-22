'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { aggregateRapportiniKpi, type RapportiniKpi, type RapportinoKpiRow } from '@/lib/dashboard/rapportiniKpi';
import { addDaysIso } from '@/lib/dashboard/addDaysIso';

function todayRomeIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function formatGiorno(iso: string): string {
  // Parse e formatta in UTC: l'etichetta coincide sempre con la data ISO,
  // a prescindere dal fuso del browser (coerente con addDaysIso, UTC-safe).
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

type Tile = { label: string; value: number; dotVar: string };

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
        { label: 'Inviati', value: kpi.inviato, dotVar: '--status-ok' },
        { label: 'In corso', value: kpi.valido, dotVar: '--status-progress' },
        { label: 'Scaduti', value: kpi.scaduto, dotVar: '--status-ko' },
        { label: 'Non consegnati', value: kpi.nonConsegnati, dotVar: '--status-warn' },
      ]
    : [];

  const isOggi = giorno === todayRomeIso();

  return (
    <section className="border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm" style={{ borderRadius: 'var(--radius-xl)' }}>
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
          className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
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
          className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
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
              <div
                key={t.label}
                className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-3"
              >
                <p className="text-2xl font-semibold tabular-nums text-[var(--brand-text-main)]">{t.value}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-[var(--brand-text-muted)]">
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: `var(${t.dotVar})` }}
                  />
                  {t.label}
                </p>
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
