'use client';
import type { Assignment } from '@/types';
import { getTerritoryStyle } from '@/lib/territoryColors';

export default function OperatorCard({
  a,
  onDelete,
  onEdit,
  taskCount,
}: {
  a: Assignment;
  onDelete: () => void;
  onEdit: (assignment: Assignment) => void;
  taskCount?: number;
}) {
  const style = getTerritoryStyle(a.territory?.name);
  const terr = a.territory?.name ?? '';
  const acts = (a.activities && a.activities.length
    ? a.activities.map((x) => x.name)
    : a.activity?.name
      ? [a.activity.name]
      : []
  ).filter(Boolean);
  const cc = a.cost_center ?? '';

  return (
    <div
      className="group relative rounded-lg border px-2 py-1.5 text-[11px] leading-snug shadow-sm transition hover:shadow"
      style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
    >
      <span
        className="absolute left-0 top-0 h-full w-1 rounded-l-lg"
        style={{ backgroundColor: style.band }}
      />

      <div className="flex items-center justify-between gap-2 pl-1">
        <div className="min-w-0 flex flex-1 items-center gap-1.5 pr-1">
          {a.reperibile && (
            <span
              className="mt-0.5 shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none"
              style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              REP
            </span>
          )}
          <span
            className="block min-w-0 truncate whitespace-nowrap font-semibold uppercase tracking-tight"
            title={a.staff?.display_name ?? '-'}
          >
            {`${a.staff?.display_name ?? '-'}${taskCount != null && taskCount > 0 ? ` (${taskCount})` : ''}`}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(a);
            }}
            className="rounded border border-white/20 bg-black/20 px-1.5 py-px text-[9px] font-medium"
            title="Modifica"
          >
            M
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded border border-white/20 bg-black/20 px-1.5 py-px text-[9px] font-medium text-[var(--danger)]"
            title="Elimina"
          >
            X
          </button>
        </div>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 pl-1 text-[10px] opacity-75">
        {terr && <span className="font-medium">{terr}</span>}
        {terr && acts.length > 0 && <span className="opacity-50">|</span>}
        {acts.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="max-w-[110px] truncate rounded border px-1 leading-tight"
            style={{ borderColor: 'currentColor' }}
          >
            {name}
          </span>
        ))}
        {cc && (terr || acts.length > 0) && <span className="opacity-50">|</span>}
        {cc && <span className="opacity-70">{cc}</span>}
      </div>
    </div>
  );
}
