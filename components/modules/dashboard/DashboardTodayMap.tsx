'use client';

import dynamic from 'next/dynamic';
import type { TodayOperatorMarker } from '@/lib/dashboard/todayOperators';

const TodayOperatorsMap = dynamic(() => import('./TodayOperatorsMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--brand-text-muted)]">
      Caricamento mappa…
    </div>
  ),
});

export default function DashboardTodayMap({ operators }: { operators: TodayOperatorMarker[] }) {
  return (
    <section className="flex flex-col border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm" style={{ borderRadius: 'var(--radius-xl)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Operatori di oggi</h2>
        <span className="rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-primary)]">
          {operators.length} in mappa
        </span>
      </div>
      <div className="h-[360px] w-full overflow-hidden rounded-xl border border-[var(--brand-border)]">
        {operators.length > 0 ? (
          <TodayOperatorsMap operators={operators} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-sm text-[var(--brand-text-muted)]">
            Nessun operatore con coordinate per oggi.
          </div>
        )}
      </div>
    </section>
  );
}
