'use client';
import type { DragEvent } from 'react';
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
  onDropAssignment,
}: {
  days: Date[];
  assignmentsByCell: Record<string, Assignment[]>;
  territories: Territory[];
  includeNoTerritory: boolean;
  sortMode: SortMode;
  onAdd: (d: Date) => void;
  onEdit: (a: Assignment) => void;
  onDelete: (a: Assignment) => void;
  onDropAssignment: (args: {
    assignmentId: string;
    fromDay: string;
    fromTerritoryId: string | null;
    toDay: Date;
    toTerritoryId: string | null;
    copy: boolean;
  }) => void;
}) {
  const columns = includeNoTerritory
    ? [...territories, { id: 'none', name: 'Senza territorio' } as Territory]
    : territories;

  // Giorno fisso 88px + ogni territorio prende 1fr ? niente scroll orizzontale
  const gridTemplate = `88px repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="grid border-b border-[var(--card-bd)] bg-[var(--brand-bg)] text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-text-muted)]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="px-2 py-2">Giorno</div>
        {columns.map((t) => (
          <div
            key={t.id}
            className="border-l border-[var(--card-bd)] px-2 py-2 truncate"
            title={t.name}
          >
            {t.name}
          </div>
        ))}
      </div>

      {/* Rows */}
      {days.map((d, idx) => {
        const iso    = fmtDay(d);
        const isHol  = isItalyHoliday(d);
        const isWe   = isWeekend(d);

        return (
          <div
            key={iso}
            className="grid border-b border-[var(--card-bd)] last:border-b-0"
            style={{
              gridTemplateColumns: gridTemplate,
              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#FAFBFF',
            }}
          >
            {/* Colonna giorno */}
            <div
              className="flex flex-col justify-center px-2 py-2"
              style={{
                backgroundColor: isHol
                  ? 'var(--hol-bg)'
                  : isWe
                  ? 'var(--we-bg)'
                  : 'transparent',
              }}
            >
              <div className="text-[10px] uppercase tracking-wide text-[var(--brand-text-muted)]">
                {d.toLocaleDateString('it-IT', { weekday: 'short' })}
              </div>
              <div className="text-sm font-bold text-[var(--brand-text-main)]">
                {d.getDate()}
              </div>
            </div>

            {/* Celle territorio */}
            {columns.map((t) => {
              const key    = `${iso}|${t.id}`;
              const list   = assignmentsByCell[key] ?? [];
              const sorted = sortAssignments(list, sortMode);

              const onDrop = (e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                const data = JSON.parse(raw) as {
                  id: string;
                  fromDay: string;
                  fromTerritoryId: string | null;
                };
                const copy = e.altKey || e.ctrlKey || e.metaKey;
                onDropAssignment({
                  assignmentId: data.id,
                  fromDay: data.fromDay,
                  fromTerritoryId: data.fromTerritoryId,
                  toDay: d,
                  toTerritoryId: t.id === 'none' ? null : t.id,
                  copy,
                });
              };

              return (
                <div
                  key={t.id}
                  className="group relative border-l border-[var(--card-bd)] px-1.5 py-1.5 hover:bg-blue-50/30"
                  onClick={() => !sorted.length && onAdd(d)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                >
                  {sorted.length ? (
                    <div className="flex flex-col gap-1">
                      {sorted.map((a) => (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'copyMove';
                            e.dataTransfer.setData(
                              'application/json',
                              JSON.stringify({
                                id: a.id,
                                fromDay: iso,
                                fromTerritoryId: t.id === 'none' ? null : t.id,
                              })
                            );
                          }}
                        >
                          <OperatorCard a={a} onDelete={() => onDelete(a)} onEdit={onEdit} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAdd(d); }}
                      className="absolute inset-1 hidden items-center justify-center rounded-lg border border-dashed border-[var(--brand-primary)] text-base font-semibold text-[var(--brand-primary)] opacity-0 transition group-hover:flex group-hover:opacity-100"
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
  );
}
