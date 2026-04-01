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

      <div className="flex items-start justify-between gap-1 pl-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="font-semibold uppercase tracking-tight break-words">
            {a.staff?.display_name ?? '-'}
          </span>
          {a.reperibile && (
            <span
              className="shrink-0 rounded px-1 py-px text-[9px] font-bold"
              style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
            >
              REP
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(a);
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/60 bg-white/70"
            title="Modifica"
            aria-label="Modifica"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/60 bg-white/70 text-rose-700"
            title="Elimina"
            aria-label="Elimina"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0 pl-1 opacity-75 text-[10px]">
        {terr && <span className="font-medium">{terr}</span>}
        {terr && act && <span className="opacity-50">&middot;</span>}
        {act && <span className="truncate max-w-[90px]">{act}</span>}
        {cc && <span className="opacity-50">&middot;</span>}
        {cc && <span className="opacity-70">{cc}</span>}
      </div>
    </div>
  );
}
