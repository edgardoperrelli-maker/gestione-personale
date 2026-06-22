'use client';
import { useMemo, useState } from 'react';
import { buildConfronto, filterRows, totali, type ClientRow, type PerfFilters } from '@/lib/performance/shape';
import PerfFilterBar, { type FilterOptions } from './PerfFilterBar';
import { colorForMacro } from './palette';

export default function PerformanceConfronto({ allRows, options, initial }: { allRows: ClientRow[]; options: FilterOptions; initial: PerfFilters }) {
  const [f, setF] = useState<PerfFilters>(initial);
  const rows = useMemo(() => filterRows(allRows, f), [allRows, f]);
  const operators = useMemo(() => buildConfronto(rows), [rows]);
  const t = totali(rows);
  const max = Math.max(1, ...operators.map((o) => o.total));

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Confronto operatori</h2>
        <span className="text-xs text-[var(--brand-text-muted)]">
          {t.totale.toLocaleString('it-IT')} interventi{t.valvole > 0 && <> · {t.valvole} con saracinesca</>}
        </span>
      </div>
      <p className="mb-2 text-xs text-[var(--brand-text-muted)]">Interventi completati per operatore · barra divisa per attività</p>
      <PerfFilterBar value={f} onChange={setF} options={options} />
      {operators.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento per i filtri selezionati.</p>
      ) : (
        <div className="space-y-1">
          {operators.map((o) => {
            const segs = Object.entries(o.byMacro).sort((a, b) => b[1] - a[1]);
            return (
              <div key={o.id} className="grid grid-cols-[160px_1fr_56px] items-center gap-3 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--brand-surface-muted)]">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--brand-text-main)]">{o.name}</div>
                  <div className="truncate text-xs text-[var(--brand-text-muted)]">
                    {segs.map(([k]) => k).join(', ') || '—'}
                    {o.valvole > 0 && <span className="text-[var(--warning)]"> · {o.valvole} saracinesca</span>}
                  </div>
                </div>
                <div className="h-3.5 overflow-hidden rounded-[var(--radius-md)] bg-[var(--brand-border)]/40">
                  <div className="flex h-full" style={{ width: `${(o.total / max) * 100}%` }}>
                    {segs.map(([name, n]) => (
                      <div key={name} className="h-full" style={{ flex: n, background: colorForMacro(name) }} title={`${name}: ${n}`} />
                    ))}
                  </div>
                </div>
                <div className="text-right text-[13px] font-semibold tabular-nums text-[var(--brand-text-main)]">{o.total.toLocaleString('it-IT')}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
