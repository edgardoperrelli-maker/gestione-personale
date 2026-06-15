'use client';

import { COST_CENTERS } from '@/constants/cost-centers';
import type { CostCenterRange } from '@/lib/costCenter';

export default function CostCenterRangesEditor({
  value,
  onChange,
  disabled,
}: {
  value: CostCenterRange[];
  onChange: (ranges: CostCenterRange[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<CostCenterRange>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () =>
    onChange([...value, { cost_center: COST_CENTERS[0], valid_from: '', valid_to: null }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_130px_auto] items-end gap-2">
          <select
            value={r.cost_center}
            disabled={disabled}
            onChange={(e) => update(i, { cost_center: e.target.value })}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-sm"
          >
            {COST_CENTERS.map((cc) => (
              <option key={cc} value={cc}>{cc}</option>
            ))}
          </select>
          <input
            type="date"
            title="Dal"
            value={r.valid_from}
            disabled={disabled}
            onChange={(e) => update(i, { valid_from: e.target.value })}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            title="Al (opzionale)"
            value={r.valid_to ?? ''}
            disabled={disabled}
            onChange={(e) => update(i, { valid_to: e.target.value || null })}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(i)}
            className="rounded-lg border border-[var(--brand-border)] px-2 py-1.5 text-sm text-[var(--danger)]"
            aria-label="Rimuovi periodo"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-surface-muted)]"
      >
        + Aggiungi periodo
      </button>
    </div>
  );
}
