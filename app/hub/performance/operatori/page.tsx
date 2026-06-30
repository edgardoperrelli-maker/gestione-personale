import Link from 'next/link';
import { assertKpiAccess } from '@/lib/performance/kpiGate';
import { loadPerformanceBundle } from '@/lib/performance/load';
import PerformancePanel from '@/components/modules/performance/PerformancePanel';

export const dynamic = 'force-dynamic';

export default async function PerformanceOperatoriPage() {
  await assertKpiAccess();
  const bundle = await loadPerformanceBundle();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <Link href="/hub/performance" className="text-xs text-[var(--brand-text-muted)] hover:underline">← KPI</Link>
        <h1 className="text-2xl font-semibold text-[var(--brand-text-main)]">Performance operatori</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">Cosa hanno fatto gli operatori: interventi completati, con produzione giornaliera e filtri indipendenti per ogni grafico.</p>
      </div>
      <PerformancePanel
        rows={bundle.rows}
        operatori={bundle.operatori}
        territori={bundle.territori}
        committenti={bundle.committenti}
        minDate={bundle.minDate}
      />
    </div>
  );
}
