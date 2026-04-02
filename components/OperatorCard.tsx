'use client';
import type { Assignment } from '@/types';
import { getTerritoryStyle } from '@/lib/territoryColors';

export default function OperatorCard({
  a,
  onDelete,
  onEdit,
}: {
  a: Assignment;
  onDelete: () => void;
  onEdit: (assignment: Assignment) => void;
}) {
  const style = getTerritoryStyle(a.territory?.name);
  const terr = a.territory?.name ?? '';
  const act = a.activity?.name ?? '';
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
              style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
            >
              REP
            </span>
          )}
          <span
            className="block min-w-0 truncate whitespace-nowrap font-semibold uppercase tracking-tight"
            title={a.staff?.display_name ?? '-'}
          >
            {a.staff?.display_name ?? '-'}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(a);
            }}
            className="rounded border border-white/60 bg-white/70 px-1.5 py-px text-[9px] font-medium"
            title="Modifica"
          >
            M
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded border border-white/60 bg-white/70 px-1.5 py-px text-[9px] font-medium text-rose-700"
            title="Elimina"
          >
            X
          </button>
        </div>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0 pl-1 text-[10px] opacity-75">
        {terr && <span className="font-medium">{terr}</span>}
        {terr && act && <span className="opacity-50">|</span>}
        {act && <span className="max-w-[90px] truncate">{act}</span>}
        {cc && <span className="opacity-50">|</span>}
        {cc && <span className="opacity-70">{cc}</span>}
      </div>
    </div>
  );
}
