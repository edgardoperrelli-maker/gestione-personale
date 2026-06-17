'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import PerformanceConfronto from './PerformanceConfronto';
import PerformanceAndamento from './PerformanceAndamento';
import PerformanceDistribuzioni from './PerformanceDistribuzioni';
import PerformanceDettaglio from './PerformanceDettaglio';
import type { PerformanceData } from '@/lib/performance/shape';

export default function PerformancePanel({ data, selOperator }: { data: PerformanceData; selOperator: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();

  const select = (id: string) => {
    const p = new URLSearchParams(sp.toString());
    if (id && id !== selOperator) p.set('selOperator', id);
    else p.delete('selOperator');
    router.push(`/hub/performance?${p.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[var(--brand-gold)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-gold)]">Admin Plus</span>
        <span className="text-sm text-[var(--brand-text-muted)]">{data.totale.toLocaleString('it-IT')} interventi completati nel periodo</span>
      </div>
      <PerformanceConfronto operators={data.confronto} onSelect={select} selectedId={selOperator} />
      <PerformanceAndamento points={data.andamento.points} granularity={data.andamento.granularity} />
      <PerformanceDistribuzioni perMacro={data.perMacro} perCommittente={data.perCommittente} perTerritorio={data.perTerritorio} />
      {data.dettaglio && <PerformanceDettaglio operatorName={data.dettaglio.name} rows={data.dettaglio.rows} />}
    </div>
  );
}
