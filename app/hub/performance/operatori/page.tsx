import Link from 'next/link';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { assertKpiAccess } from '@/lib/performance/kpiGate';
import { loadPerformanceBundle } from '@/lib/performance/load';
import PerformancePanel from '@/components/modules/performance/PerformancePanel';

export const dynamic = 'force-dynamic';

export default async function PerformanceOperatoriPage() {
  await assertKpiAccess();
  const bundle = await loadPerformanceBundle();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="space-y-2">
        <Link href="/hub/performance" className="text-xs text-[var(--brand-text-muted)] hover:underline">← KPI</Link>
        <ObjectHeader
          title="Performance operatori"
          sub="Cosa hanno fatto gli operatori: esiti positivi/negativi, produzione giornaliera per gruppo attività reale e filtri indipendenti per ogni grafico."
        />
      </div>
      <PerformancePanel
        rows={bundle.rows}
        operatori={bundle.operatori}
        territori={bundle.territori}
        committenti={bundle.committenti}
        gruppi={bundle.gruppi}
        attivita={bundle.attivita}
        minDate={bundle.minDate}
      />
    </div>
  );
}
