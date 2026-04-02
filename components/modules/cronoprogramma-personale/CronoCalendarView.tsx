'use client';

import { type DragEvent, useMemo } from 'react';
import OperatorCard from '@/components/OperatorCard';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import type { Assignment } from '@/types';
import type { DayRow, SortMode } from './types';
import {
  eqDate,
  filterAssignments,
  fmtDay,
  indexDays,
  isCopyDropGesture,
  readAssignmentDragData,
  sortAssignments,
  writeAssignmentDragData,
} from './utils';

const dayBgClass = (d: Date) => {
  if (isItalyHoliday(d)) return 'bg-rose-50';
  if (isWeekend(d)) return 'bg-[var(--we-bg)]';
  return 'bg-[var(--card-bg)]';
};

export default function CronoCalendarView({
  weeks,
  anchor,
  today,
  days,
  assignments,
  onAdd,
  onCopyDayToNext,
  showMonthLabels,
  sortMode,
  filters,
  setSortMode,
  onDelete,
  onEdit,
  onDropAssignment,
}: {
  weeks: Date[][];
  anchor: Date;
  today: Date;
  days: DayRow[];
  assignments: Record<string, Assignment[]>;
  onAdd: (d: Date) => void;
  onCopyDayToNext: (d: Date) => void;
  showMonthLabels: boolean;
  sortMode: SortMode;
  filters: string[];
  setSortMode: (m: SortMode) => void;
  onDelete: (a: Assignment) => void;
  onEdit: (a: Assignment) => void;
  onDropAssignment: (args: {
    assignmentId: string;
    fromDay: string;
    fromTerritoryId: string | null;
    toDay: Date;
    toTerritoryId: string | null;
    copy: boolean;
  }) => void;
}) {
  const dayMap = useMemo(() => indexDays(days), [days]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-7 px-1 text-xs font-medium text-[var(--brand-text-muted)]">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((h) => (
          <div key={h} className="px-2">
            {h}
          </div>
        ))}
      </div>

      {weeks.map((w, i) => (
        <div key={i} className="grid grid-cols-7 gap-3">
          {w.map((d: Date) => (
            <DayCell
              key={fmtDay(d)}
              d={d}
              isToday={eqDate(d, today)}
              isCurrentMonth={d.getMonth() === anchor.getMonth()}
              dayMap={dayMap}
              assignments={assignments}
              onAdd={onAdd}
              onCopyDayToNext={onCopyDayToNext}
              showMonthLabel={showMonthLabels && d.getDate() === 1}
              sortMode={sortMode}
              filters={filters}
              setSortMode={setSortMode}
              onDelete={onDelete}
              onEdit={onEdit}
              onDropAssignment={onDropAssignment}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DayCell(props: {
  d: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  dayMap: Record<string, DayRow>;
  assignments: Record<string, Assignment[]>;
  onAdd: (d: Date) => void;
  onCopyDayToNext: (d: Date) => void;
  showMonthLabel: boolean;
  sortMode: SortMode;
  filters: string[];
  setSortMode: (m: SortMode) => void;
  onDelete: (a: Assignment) => void;
  onEdit: (a: Assignment) => void;
  onDropAssignment: (args: {
    assignmentId: string;
    fromDay: string;
    fromTerritoryId: string | null;
    toDay: Date;
    toTerritoryId: string | null;
    copy: boolean;
  }) => void;
}) {
  const {
    d,
    isToday,
    dayMap,
    assignments,
    onAdd,
    onCopyDayToNext,
    showMonthLabel,
    sortMode,
    filters,
    onDelete,
    onEdit,
    onDropAssignment,
  } = props;

  const iso = fmtDay(d);
  const dayRow = dayMap[iso];
  const list = dayRow ? assignments[dayRow.id] ?? [] : [];

  const visible = filterAssignments(list, filters);
  const sorted = sortAssignments(visible, sortMode);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const data = readAssignmentDragData(e.dataTransfer);
    if (!data) return;
    onDropAssignment({
      assignmentId: data.id,
      fromDay: data.fromDay,
      fromTerritoryId: data.fromTerritoryId,
      toDay: d,
      toTerritoryId: data.fromTerritoryId,
      copy: isCopyDropGesture(e),
    });
  };

  return (
    <div
      className={`rounded-2xl border border-[var(--card-bd)] p-2 shadow-sm ${dayBgClass(
        d
      )} hover:ring-1 hover:ring-black/10`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = isCopyDropGesture(e) ? 'copy' : 'move';
      }}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full font-bold ${
              isToday
                ? 'bg-[var(--brand-primary)] text-white ring-2 ring-[var(--brand-primary)] ring-offset-1'
                : isItalyHoliday(d)
                ? 'text-rose-700'
                : ''
            }`}
          >
            {d.getDate()}
          </span>
          {isItalyHoliday(d) && (
            <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide">
              Festivo
            </span>
          )}
          {showMonthLabel && <span>{d.toLocaleDateString('it-IT', { month: 'short' })}</span>}
          {sortMode !== 'AZ' && (
            <button
              onClick={() => props.setSortMode('AZ')}
              className="rounded-full border bg-white px-2 py-0.5 text-[10px] hover:bg-gray-50"
              title="Ordina A - Z"
            >
              A-Z
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCopyDayToNext(d)}
            className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-50"
            title="Copia l'intero giorno al successivo"
          >
            Copia +1
          </button>
          <button
            onClick={() => onAdd(d)}
            className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-50"
          >
            Nuovo
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {sorted.length ? (
          sorted.map((a) => (
            <div
              key={a.id}
              draggable
              className="cursor-grab active:cursor-grabbing"
              onDragStart={(e) =>
                writeAssignmentDragData(e.dataTransfer, {
                  id: a.id,
                  fromDay: iso,
                  fromTerritoryId: a.territory?.id ?? null,
                })
              }
            >
              <OperatorCard a={a} onDelete={() => onDelete(a)} onEdit={onEdit} />
            </div>
          ))
        ) : (
          <div className="text-xs opacity-50">-</div>
        )}
      </div>
    </div>
  );
}
