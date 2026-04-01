'use client';
import OperatorCard from '@/components/OperatorCard';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import type { Assignment, Territory } from '@/types';
import type { SortMode } from './types';
import { fmtDay, sortAssignments } from './utils';

export default function CronoGridView({
  days,
  assignmentsByCell,
  territories,
  includeNoTerritory,
  sortMode,
  onAdd,
  onEdit,
  onDelete,
}: {
  days: Date[];
  assignmentsByCell: Record<string, Assignment[]>;
  territories: Territory[];
  includeNoTerritory: boolean;
  sortMode: SortMode;
  onAdd: (d: Date) => void;
  onEdit: (a: Assignment) => void;
  onDelete: (a: Assignment) => void;
}) {
  const columns = includeNoTerritory ? [...territories, { id: 'none', name: 'Senza territorio' } as Territory] : territories;
  const gridTemplate = `140px repeat(${columns.length}, 190px)`;

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div
            className="grid border-b border-[var(--card-bd)] text-xs font-semibold text-[var(--brand-text-muted)]"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest">Giorno</div>
            {columns.map((t) => (
              <div key={t.id} className="border-l border-[var(--card-bd)] px-3 py-2 text-[10px] uppercase tracking-wide">
                {t.name}
              </div>
            ))}
          </div>

          {days.map((d, idx) => {
            const iso = fmtDay(d);
            return (
              <div
                key={iso}
                className={`grid border-b border-[var(--card-bd)] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFF]'}`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div
                  className={`px-3 py-2 text-sm font-medium ${
                    isItalyHoliday(d) ? 'bg-[var(--hol-bg)]' : isWeekend(d) ? 'bg-[var(--we-bg)]' : ''
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-[var(--brand-text-muted)]">
                    {d.toLocaleDateString('it-IT', { weekday: 'short' })}
                  </div>
                  <div className="text-base font-semibold">{d.getDate()}</div>
                </div>
                {columns.map((t) => {
                  const key = `${iso}|${t.id}`;
                  const list = assignmentsByCell[key] ?? [];
                  const sorted = sortAssignments(list, sortMode);
                  return (
                    <div
                      key={t.id}
                      className="group relative border-l border-[var(--card-bd)] px-2 py-1.5 hover:bg-blue-50/30"
                    >
                      {sorted.length ? (
                        <div className="flex flex-col gap-2">
                          {sorted.map((a) => (
                            <OperatorCard key={a.id} a={a} onDelete={() => onDelete(a)} onEdit={onEdit} />
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAdd(d)}
                          className="absolute inset-2 hidden items-center justify-center rounded-lg border border-dashed border-[var(--brand-primary)] text-sm font-semibold text-[var(--brand-primary)] opacity-0 transition group-hover:flex group-hover:opacity-100"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
