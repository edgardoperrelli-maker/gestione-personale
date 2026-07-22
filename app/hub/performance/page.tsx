import Link from 'next/link';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { assertKpiAccess } from '@/lib/performance/kpiGate';

export const dynamic = 'force-dynamic';

const cardClass =
  'group rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-sm transition hover:border-[var(--brand-primary)] hover:shadow-md';

export default async function KpiLandingPage() {
  await assertKpiAccess();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <ObjectHeader title="KPI" sub="Scegli la vista." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/hub/performance/operatori" className={cardClass}>
          <h2 className="text-lg font-semibold text-[var(--brand-text-main)] group-hover:text-[var(--brand-primary)]">Performance operatori</h2>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">Interventi completati per operatore: produzione giornaliera, confronto, distribuzioni e dettaglio.</p>
        </Link>
        <Link href="/hub/performance/economica" className={cardClass}>
          <h2 className="text-lg font-semibold text-[var(--brand-text-main)] group-hover:text-[var(--brand-primary)]">Produzione economica</h2>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">Valorizzazione € (Produzione vs SAL), listino tariffe, audit a tre vie ed export Excel.</p>
        </Link>
      </div>
    </div>
  );
}
