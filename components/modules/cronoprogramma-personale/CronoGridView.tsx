'use client';
import { type DragEvent } from 'react';
import OperatorCard from '@/components/OperatorCard';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import { eqDate } from './utils';
import type { Assignment, Territory } from '@/types';
import type { SortMode } from './types';
import {
  fmtDay,
  isCopyDropGesture,
  readAssignmentDragData,
  sortAssignments,
  writeAssignmentDragData,
} from './utils';

export default function CronoGridView({
  days,
  today,
  assignmentsByCell,
  territories,
  includeNoTerritory,
  sortMode,
  onAdd,
  onCopyDayToNext,
  onEdit,
  onDelete,
  onDropAssignment,
}: {
  days: Date[];
  today: Date;
  assignmentsByCell: Record<string, Assignment[]>;
  territories: Territory[];
  includeNoTerritory: boolean;
  sortMode: SortMode;
  onAdd: (d: Date) => void;
  onCopyDayToNext: (d: Date) => void;
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

  const gridTemplate = `88px repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm overflow-hidden">
      {/* Header colonne territorio */}
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

      {/* Righe giorni */}
      {days.map((d) => {
        const iso     = fmtDay(d);
        const isHol   = isItalyHoliday(d);
        const isWe    = isWeekend(d);
        const isToday = eqDate(d, today);

        /* colore di sfondo dell'intera riga — priorità: oggi > festività > weekend > default */
        const rowBg = isToday
          ? '#EFF6FF'          /* blue-50 */
          : isHol
          ? '#FFF0F2'          /* red-50 */
          : isWe
          ? 'var(--we-bg)'
          : undefined;

        return (
          <div
            key={iso}
            className="grid border-b border-[var(--card-bd)] last:border-b-0"
            style={{
              gridTemplateColumns: gridTemplate,
              backgroundColor: rowBg,
            }}
          >
            {/* Cella giorno */}
            <div
              className="flex flex-col justify-center px-2 py-2"
              style={{
                borderLeft: isToday
                  ? '3px solid var(--brand-primary)'
                  : isHol
                  ? '3px solid #F43F5E'
                  : '3px solid transparent',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wide font-medium"
                style={{ color: isHol ? '#BE123C' : 'var(--brand-text-muted)' }}
              >
                {d.toLocaleDateString('it-IT', { weekday: 'short' })}
              </div>
              <div
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold ${
                  isToday ? 'text-white' : isHol ? 'text-rose-700' : 'text-[var(--brand-text-main)]'
                }`}
                style={isToday ? { backgroundColor: 'var(--brand-primary)' } : {}}
              >
                {d.getDate()}
              </div>
              {isHol && (
                <div className="mt-0.5 text-[9px] font-semibold text-rose-500 uppercase tracking-wide">
                  Festivo
                </div>
              )}
              <button
                type="button"
                onClick={() => onCopyDayToNext(d)}
                className="mt-1 w-fit rounded-md border border-[var(--brand-border)] bg-white px-2 py-1 text-[10px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-nav-active-bg)]"
                title="Copia l'intero giorno al successivo"
              >
                Copia +1
              </button>
            </div>

            {/* Celle territorio */}
            {columns.map((t) => {
              const key    = `${iso}|${t.id}`;
              const list   = assignmentsByCell[key] ?? [];
              const sorted = sortAssignments(list, sortMode);

              const onDrop = (e: DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                const data = readAssignmentDragData(e.dataTransfer);
                if (!data) return;
                const copy = isCopyDropGesture(e);
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
                  className="group relative border-l border-[var(--card-bd)] px-1.5 py-1.5"
                  style={{
                    backgroundColor: isToday
                      ? 'rgba(59,130,246,0.04)'
                      : isHol
                      ? 'rgba(244,63,94,0.03)'
                      : undefined,
                  }}
                  onClick={() => !sorted.length && onAdd(d)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = isCopyDropGesture(e) ? 'copy' : 'move';
                  }}
                  onDrop={onDrop}
                >
                  {sorted.length ? (
                    <div className="flex flex-col gap-1">
                      {sorted.map((a) => (
                        <div
                          key={a.id}
                          draggable
                          className="cursor-grab active:cursor-grabbing"
                          onDragStart={(e) => {
                            writeAssignmentDragData(e.dataTransfer, {
                              id: a.id,
                              fromDay: iso,
                              fromTerritoryId: t.id === 'none' ? null : t.id,
                            });
                          }}
                        >
                          <OperatorCard
                            a={a}
                            onDelete={() => onDelete(a)}
                            onEdit={onEdit}
                          />
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
