import Link from 'next/link';
import { assertKpiAccess } from '@/lib/performance/kpiGate';
import PerformanceEconomica from '@/components/modules/performance/PerformanceEconomica';

export const dynamic = 'force-dynamic';

export default async function ProduzioneEconomicaPage() {
  await assertKpiAccess();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <Link href="/hub/performance" className="text-xs text-[var(--brand-text-muted)] hover:underline">← KPI</Link>
        <h1 className="text-2xl font-semibold text-[var(--brand-text-main)]">Produzione economica</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">Valorizzazione in € degli esiti positivi ACEA: Produzione vs SAL, audit a tre vie, export Excel.</p>
      </div>
      <PerformanceEconomica />
    </div>
  );
}
