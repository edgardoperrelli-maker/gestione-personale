'use client';
import type { Assignment } from '@/types';
import Badge from '@/components/Badge';
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
  const terr = a.territory?.name ?? 'Senza territorio';
  const act = a.activity?.name ?? 'Nessuna attivita';
  const notes = a.notes ?? '';

  return (
    <div
      className="group relative rounded-lg border px-2.5 py-2 text-[10px] shadow-sm transition hover:shadow"
      style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
    >
      <span className="absolute left-0 top-0 h-full w-1 rounded-l-xl" style={{ backgroundColor: style.band }} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wide truncate">
              {a.staff?.display_name ?? '-'}
            </span>
            {a.reperibile && <Badge variant="danger">REP</Badge>}
          </div>
          <div className="mt-0.5 text-[10px] opacity-75">{terr}</div>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(a);
            }}
            className="rounded-md border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] text-[var(--brand-text-main)]"
            title="Modifica"
          >
            Modifica
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-md border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] text-rose-700"
            title="Elimina"
          >
            Elimina
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-full border border-white/70 bg-white/60 px-2 py-0.5">{act}</span>
        {a.cost_center && (
          <span className="rounded-full border border-white/70 bg-white/60 px-2 py-0.5">CdC: {a.cost_center}</span>
        )}
      </div>

      {notes && <div className="mt-1.5 text-[10px] opacity-80 line-clamp-2">{notes}</div>}
    </div>
  );
}
