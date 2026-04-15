'use client';

import { type DragEvent, useState } from 'react';
import OperatorCard from '@/components/OperatorCard';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import type { Assignment, Territory } from '@/types';
import { getTerritoryStyle, TERRITORY_COLORS } from '@/lib/territoryColors';
import type { SortMode } from './types';
import {
  eqDate,
  fmtDay,
  isCopyDropGesture,
  readAssignmentDragData,
  readDayDragData,
  sortAssignments,
  writeAssignmentDragData,
  writeDayDragData,
} from './utils';

function TerritoryDot({ name }: { name: string }) {
  const s = getTerritoryStyle(name);
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: s.band }}
    />
  );
}

function countForTerritory(
  terrId: string,
  assignmentsByCell: Record<string, Assignment[]>,
  days: Date[]
): number {
  let n = 0;
  for (const d of days) {
    const iso = fmtDay(d);
    const key = `${iso}|${terrId}`;
    n += assignmentsByCell[key]?.length ?? 0;
  }
  return n;
}

function WeekCell({
  d,
  today,
  assignments,
  sortMode,
  onAdd,
  onDropDay,
  onEdit,
  onDelete,
  onDrop,
  terrId,
  taskCountMap,
}: {
  d: Date;
  today: Date;
  assignments: Assignment[];
  sortMode: SortMode;
  onAdd: (d: Date) => void;
  onDropDay: (args: { fromDay: string; toDay: Date; copy: boolean }) => void;
  onEdit: (a: Assignment) => void;
  onDelete: (a: Assignment) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, d: Date, terrId: string | null) => void;
  terrId: string;
  taskCountMap?: Record<string,number>;
}) {
  const iso = fmtDay(d);
  const isHol = isItalyHoliday(d);
  const isWe = isWeekend(d);
  const isToday = eqDate(d, today);
  const sorted = sortAssignments(assignments, sortMode);

  return (
    <div
      className="group relative flex flex-col border-r border-[var(--card-bd)] last:border-r-0"
      style={{
        minHeight: 120,
        backgroundColor: isHol ? 'var(--hol-bg)' : isWe ? 'var(--we-bg)' : 'transparent',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = isCopyDropGesture(e) ? 'copy' : 'move';
      }}
      onDrop={(e) => onDrop(e, d, terrId === 'none' ? null : terrId)}
    >
      <div
        className="sticky top-0 z-10 border-b border-[var(--card-bd)] px-2 py-1.5"
        style={{
          backgroundColor: isHol
            ? 'var(--hol-bg)'
            : isWe
            ? 'var(--we-bg)'
            : 'var(--brand-surface)',
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-crono-day')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = isCopyDropGesture(e) ? 'copy' : 'move';
          }
        }}
        onDrop={(e) => {
          const dayData = readDayDragData(e.dataTransfer);
          if (!dayData) return;
          e.preventDefault();
          onDropDay({ fromDay: dayData.fromDay, toDay: d, copy: isCopyDropGesture(e) });
        }}
      >
        <div className="text-[10px] uppercase tracking-wide text-[var(--brand-text-muted)]">
          {d.toLocaleDateString('it-IT', { weekday: 'short' })}
        </div>
        <div
          draggable
          className={`inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-full text-sm font-bold active:cursor-grabbing ${
            isToday ? 'text-white' : 'text-[var(--brand-text-main)]'
          }`}
          style={isToday ? { backgroundColor: 'var(--brand-primary)' } : {}}
          title="Trascina per spostare l'intero giorno"
          onDragStart={(e) => {
            e.stopPropagation();
            writeDayDragData(e.dataTransfer, { fromDay: iso });
          }}
        >
          {d.getDate()}
        </div>
      </div>

      <div className="flex flex-col gap-1 p-1.5 flex-1">
        {sorted.map((a) => (
          <div
            key={a.id}
            draggable
            className="cursor-grab active:cursor-grabbing"
            onDragStart={(e) => {
              writeAssignmentDragData(e.dataTransfer, {
                id: a.id,
                fromDay: iso,
                fromTerritoryId: terrId === 'none' ? null : terrId,
              });
            }}
          >
            <OperatorCard a={a} onDelete={() => onDelete(a)} onEdit={onEdit} taskCount={taskCountMap?.[`${a.staff?.id}|${iso}`]} />
          </div>
        ))}

        {sorted.length === 0 && (
          <button
            type="button"
            onClick={() => onAdd(d)}
            className="absolute inset-2 hidden items-center justify-center rounded-xl border border-dashed border-[var(--brand-primary)] text-xl font-light text-[var(--brand-primary)] opacity-0 transition group-hover:flex group-hover:opacity-60"
          >
            +
          </button>
        )}

        {sorted.length > 0 && (
          <button
            type="button"
            onClick={() => onAdd(d)}
            className="mt-0.5 hidden w-full items-center justify-center rounded-lg border border-dashed border-[var(--brand-border)] py-0.5 text-xs text-[var(--brand-text-muted)] opacity-0 transition group-hover:flex group-hover:opacity-80"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

function TerritoryWeek({
  territory,
  days,
  today,
  assignmentsByCell,
  sortMode,
  onAdd,
  onDropDay,
  onEdit,
  onDelete,
  onDrop,
  taskCountMap,
}: {
  territory: Territory & { id: string };
  days: Date[];
  today: Date;
  assignmentsByCell: Record<string, Assignment[]>;
  sortMode: SortMode;
  onAdd: (d: Date) => void;
  onDropDay: (args: { fromDay: string; toDay: Date; copy: boolean }) => void;
  onEdit: (a: Assignment) => void;
  onDelete: (a: Assignment) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, d: Date, terrId: string | null) => void;
  taskCountMap?: Record<string,number>;
}) {
  const s = getTerritoryStyle(territory.name);
  const terrId = territory.id;

  return (
    <div className="flex flex-1 min-w-0 flex-col">
      <div
        className="flex items-center gap-2 border-b border-[var(--card-bd)] px-3 py-2"
        style={{ backgroundColor: s.bg }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.band }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: s.text }}>
          {territory.name}
        </span>
      </div>

      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const iso = fmtDay(d);
          const key = `${iso}|${terrId}`;
          const list = assignmentsByCell[key] ?? [];
          return (
            <WeekCell
              key={iso}
              d={d}
              today={today}
              assignments={list}
              sortMode={sortMode}
              onAdd={onAdd}
              onDropDay={onDropDay}
              onEdit={onEdit}
              onDelete={onDelete}
              onDrop={onDrop}
              terrId={terrId}
              taskCountMap={taskCountMap}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CronoSplitView({
  days,
  today,
  territories,
  includeNoTerritory,
  assignmentsByCell,
  sortMode,
  onAdd,
  onDropDay,
  onEdit,
  onDelete,
  onDropAssignment,
  taskCountMap,
}: {
  days: Date[];
  today: Date;
  territories: Territory[];
  includeNoTerritory: boolean;
  assignmentsByCell: Record<string, Assignment[]>;
  sortMode: SortMode;
  onAdd: (d: Date) => void;
  onDropDay: (args: { fromDay: string; toDay: Date; copy: boolean }) => void;
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
  taskCountMap?: Record<string,number>;
}) {
  const allColumns: Array<Territory & { id: string }> = [
    ...territories,
    ...(includeNoTerritory ? [{ id: 'none', name: 'Senza territorio' }] : []),
  ];

  const [selectedId, setSelectedId] = useState<string>(() => allColumns[0]?.id ?? '');
  const selected = allColumns.find((t) => t.id === selectedId) ?? allColumns[0];

  const handleDrop = (e: DragEvent<HTMLDivElement>, toDay: Date, toTerritoryId: string | null) => {
    e.preventDefault();
    const data = readAssignmentDragData(e.dataTransfer);
    if (!data) return;
    const copy = isCopyDropGesture(e);
    onDropAssignment({
      assignmentId: data.id,
      fromDay: data.fromDay,
      fromTerritoryId: data.fromTerritoryId,
      toDay,
      toTerritoryId,
      copy,
    });
  };

  return (
    <div
      className="flex rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm overflow-hidden"
      style={{ minHeight: 480 }}
    >
      <aside
        className="flex shrink-0 flex-col border-r border-[var(--brand-border)]"
        style={{ width: 168 }}
      >
        <div className="border-b border-[var(--brand-border)] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-text-muted)]">
            Territori
          </p>
        </div>

        <nav className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {allColumns.map((t) => {
            const s = getTerritoryStyle(t.name);
            const count = countForTerritory(t.id, assignmentsByCell, days);
            const isActive = t.id === selectedId;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition"
                style={
                  isActive
                    ? { backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text }
                    : { border: '1px solid transparent', color: 'var(--brand-text-main)' }
                }
              >
                <TerritoryDot name={t.name} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</span>
                {count > 0 && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={
                      isActive
                        ? { backgroundColor: s.band, color: '#fff' }
                        : { backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--brand-border)] p-2.5 space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--brand-text-muted)]">
            Legenda
          </p>
          {Object.entries(TERRITORY_COLORS).map(([name, style]) => (
            <div key={name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.band }} />
              <span className="text-[10px] text-[var(--brand-text-muted)] truncate">{name}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <TerritoryWeek
            territory={selected}
            days={days}
            today={today}
            assignmentsByCell={assignmentsByCell}
            sortMode={sortMode}
            onAdd={onAdd}
            onDropDay={onDropDay}
            onEdit={onEdit}
            onDelete={onDelete}
            onDrop={handleDrop}
            taskCountMap={taskCountMap}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--brand-text-muted)]">
            Seleziona un territorio
          </div>
        )}
      </div>
    </div>
  );
}
