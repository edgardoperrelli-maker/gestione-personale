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
  const terr  = a.territory?.name ?? '';
  const act   = a.activity?.name ?? '';
  const cc    = a.cost_center ?? '';

  return (
    <div
      className="group relative rounded-lg border px-2 py-1.5 text-[11px] leading-snug shadow-sm transition hover:shadow"
      style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
    >
      {/* banda sinistra */}
      <span
        className="absolute left-0 top-0 h-full w-1 rounded-l-lg"
        style={{ backgroundColor: style.band }}
      />

      {/* Badge REP — in alto a destra */}
      {a.reperibile && (
        <span
          className="absolute top-1.5 right-1.5 rounded px-1 py-px text-[9px] font-bold leading-none"
          style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
        >
          REP
        </span>
      )}

      {/* Riga 1: nome + azioni hover */}
      <div className="flex items-start justify-between gap-1 pl-1">
        <span className="font-semibold uppercase tracking-tight break-words pr-7">
          {a.staff?.display_name ?? '—'}
        </span>

        {/* Azioni visibili solo on-hover */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(a); }}
            className="rounded border border-white/60 bg-white/70 px-1.5 py-px text-[9px] font-medium"
            title="Modifica"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded border border-white/60 bg-white/70 px-1.5 py-px text-[9px] font-medium text-rose-700"
            title="Elimina"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Riga 2: territorio · attività · CdC su una riga */}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0 pl-1 opacity-75 text-[10px]">
        {terr && <span className="font-medium">{terr}</span>}
        {terr && act && <span className="opacity-50">·</span>}
        {act  && <span className="truncate max-w-[90px]">{act}</span>}
        {cc   && <span className="opacity-50">·</span>}
        {cc   && <span className="opacity-70">{cc}</span>}
      </div>
    </div>
  );
}
