'use client';

export default function CronoStats({
  total,
  staff,
  reperibili,
}: {
  total: number;
  staff: number;
  reperibili: number;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <StatCard label="Assegnazioni nel range" value={total} />
      <StatCard label="Operatori attivi" value={staff} />
      <StatCard label="Reperibili nel range" value={reperibili} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
      <div className="text-xs text-[var(--brand-text-muted)]">{label}</div>
      <div className="text-lg font-semibold text-[var(--brand-primary)]">{value}</div>
    </div>
  );
}
