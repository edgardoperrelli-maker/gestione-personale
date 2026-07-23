/**
 * Avanzamento compatto «n/m» con barretta (sistema Cockpit) — es. foto caricate
 * su richieste in una riga di tabella.
 */
export default function ProgressPill({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-[5px] w-16 overflow-hidden rounded-full bg-[var(--brand-border)]" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }} />
      </span>
      <span className="font-mono text-xs text-[var(--brand-text-muted)] tabular-nums">{done}/{total}</span>
    </span>
  );
}
