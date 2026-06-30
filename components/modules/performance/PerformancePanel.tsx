'use client';
import { useMemo } from 'react';
import { emptyFilters, type ClientRow, type PerfFilters, type SelectOption } from '@/lib/performance/shape';
import type { FilterOptions } from './PerfFilterBar';
import Badge from '@/components/Badge';
import PerformanceGiornaliera from './PerformanceGiornaliera';
import PerformanceConfronto from './PerformanceConfronto';
import PerformanceDistribuzioni from './PerformanceDistribuzioni';
import PerformanceDettaglio from './PerformanceDettaglio';
import PerformanceEconomica from './PerformanceEconomica';

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function PerformancePanel({
  rows, operatori, territori, committenti, minDate,
}: {
  rows: ClientRow[];
  operatori: SelectOption[];
  territori: SelectOption[];
  committenti: SelectOption[];
  minDate: string | null;
}) {
  const options: FilterOptions = { operatori, territori, committenti, minDate };
  // Default = mese corrente (così i grafici mostrano subito dati senza impostare filtri).
  const initial = useMemo<PerfFilters>(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const monthStart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    return emptyFilters(monthStart, today);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Admin Plus</Badge>
        <span className="text-xs text-[var(--brand-text-muted)]">Ogni grafico ha i suoi filtri indipendenti · default: mese corrente</span>
      </div>
      <PerformanceGiornaliera allRows={rows} options={options} initial={initial} />
      <PerformanceConfronto allRows={rows} options={options} initial={initial} />
      <PerformanceDistribuzioni allRows={rows} options={options} initial={initial} />
      <PerformanceDettaglio allRows={rows} options={options} initial={initial} />
      <PerformanceEconomica />
    </div>
  );
}
