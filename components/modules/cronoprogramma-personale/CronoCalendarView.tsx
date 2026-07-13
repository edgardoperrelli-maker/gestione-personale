'use client';

import { type DragEvent, useMemo, useState } from 'react';
import OperatorCard from '@/components/OperatorCard';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import type { Assignment } from '@/types';
import type { DayRow, SortMode } from './types';
import { getTerritoryStyle } from '@/lib/territoryColors';
import { TIPO_META, labelDisponibilita, isAssenzaIntera, type Disponibilita } from '@/lib/disponibilita';
import { loadCollapsed, saveCollapsed } from '@/lib/cronoCollapse';
import { raggruppaSquadre } from './squadre';
import SquadraCard from './SquadraCard';
import {
  eqDate,
  filterAssignments,
  fmtDay,
  indexDays,
  isCopyDropGesture,
  readAssignmentDragData,
  readDayDragData,
  sortAssignments,
  writeAssignmentDragData,
  writeDayDragData,
} from './utils';

/** Legame di squadra: gesto e azioni passati dalle viste. */
export type SquadraHandlers = {
  onAggancia: (target: Assignment, dragged: { id: string; fromDay: string; fromTerritoryId: string | null }) => void;
  onRimuoviMembro: (squadraId: string, membroId: string) => void;
  onSciogli: (squadraId: string) => void;
  onSetCapo: (squadraId: string, membroId: string) => void;
};

const dayBgClass = (d: Date) => {
  if (isItalyHoliday(d)) return 'bg-[var(--hol-bg)]';
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
  onDropDay,
  showMonthLabels,
  sortMode,
  filters,
  setSortMode,
  onDelete,
  onEdit,
  onDropAssignment,
  staffCount,
  taskCountMap,
  assenzeByDay,
  onEditAssenza,
  appointmentCountByIso,
  squadra,
}: {
  weeks: Date[][];
  anchor: Date;
  today: Date;
  days: DayRow[];
  assignments: Record<string, Assignment[]>;
  onAdd: (d: Date) => void;
  onDropDay: (args: { fromDay: string; toDay: Date; copy: boolean }) => void;
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
  staffCount: number;
  taskCountMap?: Record<string, number>;
  assenzeByDay?: Record<string, (Disponibilita & { staff_name: string })[]>;
  onEditAssenza?: (d: Disponibilita) => void;
  appointmentCountByIso?: Record<string, number>;
  squadra: SquadraHandlers;
}) {
  const dayMap = useMemo(() => indexDays(days), [days]);

  const [collapsedTerritori, setCollapsedTerritori] = useState<Set<string>>(() => new Set(loadCollapsed()));
  const toggleTerritorio = (key: string) =>
    setCollapsedTerritori((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed([...next]);
      return next;
    });

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
              onDropDay={onDropDay}
              showMonthLabel={showMonthLabels && d.getDate() === 1}
              sortMode={sortMode}
              filters={filters}
              setSortMode={setSortMode}
              onDelete={onDelete}
              onEdit={onEdit}
              onDropAssignment={onDropAssignment}
              staffCount={staffCount}
              taskCountMap={taskCountMap}
              assenzeByDay={assenzeByDay}
              onEditAssenza={onEditAssenza}
              appointmentCountByIso={appointmentCountByIso}
              collapsedTerritori={collapsedTerritori}
              onToggleTerritorio={toggleTerritorio}
              squadra={squadra}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** True se il drag in corso è una card assegnazione (non un intero giorno). */
function isAssignmentDrag(e: DragEvent<HTMLDivElement>) {
  const t = e.dataTransfer.types;
  return !t.includes('application/x-crono-day') && (t.includes('application/json') || t.includes('text/plain'));
}

/** Card operatore singola, draggabile e drop-target: trascinandoci sopra un'altra card si crea la
 *  squadra. Durante il drag mostra un chiaro overlay "⛓ Aggancia" (non solo un occhiello in hover). */
function SingoloCard({
  a,
  iso,
  taskCount,
  onDelete,
  onEdit,
  onAggancia,
}: {
  a: Assignment;
  iso: string;
  taskCount?: number;
  onDelete: () => void;
  onEdit: (a: Assignment) => void;
  onAggancia: SquadraHandlers['onAggancia'];
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable
      className="group/s relative cursor-grab active:cursor-grabbing"
      onDragStart={(e) =>
        writeAssignmentDragData(e.dataTransfer, {
          id: a.id,
          fromDay: iso,
          fromTerritoryId: a.territory?.id ?? null,
        })
      }
      onDragOver={(e) => {
        if (!isAssignmentDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'link';
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        if (!isAssignmentDrag(e)) return;
        setOver(false);
        const data = readAssignmentDragData(e.dataTransfer);
        if (!data || data.id === a.id) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Stessa cella (giorno + territorio) → aggancia in squadra. Cella diversa → lascia bollare
        // alla cella per lo SPOSTAMENTO (così non blocco i move droppando sopra una card).
        const sameCell = data.fromDay === iso && (data.fromTerritoryId ?? null) === (a.territory?.id ?? null);
        if (sameCell) {
          e.preventDefault();
          e.stopPropagation();
          onAggancia(a, data);
        }
      }}
    >
      <OperatorCard a={a} onDelete={onDelete} onEdit={onEdit} taskCount={taskCount} />
      {/* Occhiello discoverabile a mouse fermo */}
      <div
        className="pointer-events-none absolute -right-1 -top-1 z-10 hidden h-5 w-5 items-center justify-center rounded-full border text-[10px] shadow-sm group-hover/s:flex"
        style={{ backgroundColor: 'var(--brand-primary-soft)', borderColor: 'var(--brand-primary-border)', color: 'var(--brand-primary)' }}
      >
        ⛓
      </div>
      {/* Feedback ben visibile mentre trascini un'altra card sopra questa */}
      {over && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg"
          style={{ backgroundColor: 'var(--brand-primary-soft)', outline: '2px solid var(--brand-primary)', outlineOffset: '1px' }}
        >
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shadow" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--on-primary)' }}>
            ⛓ Aggancia
          </span>
        </div>
      )}
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
  onDropDay: (args: { fromDay: string; toDay: Date; copy: boolean }) => void;
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
  staffCount: number;
  taskCountMap?: Record<string, number>;
  assenzeByDay?: Record<string, (Disponibilita & { staff_name: string })[]>;
  onEditAssenza?: (d: Disponibilita) => void;
  appointmentCountByIso?: Record<string, number>;
  collapsedTerritori?: Set<string>;
  onToggleTerritorio?: (key: string) => void;
  squadra: SquadraHandlers;
}) {
  const {
    d,
    isToday,
    dayMap,
    assignments,
    onAdd,
    onDropDay,
    showMonthLabel,
    sortMode,
    filters,
    onDelete,
    onEdit,
    onDropAssignment,
    staffCount,
    taskCountMap,
    assenzeByDay,
    onEditAssenza,
    squadra,
  } = props;

  const iso = fmtDay(d);
  const dayRow = dayMap[iso];
  const list = dayRow ? assignments[dayRow.id] ?? [] : [];

  // Chi ha un'assenza giornaliera intera. Le card SINGOLE dell'assente non compaiono (resta nella
  // sezione assenze sopra); i MEMBRI DI SQUADRA restano invece visibili (barrati) così il buco è chiaro.
  const absentIds = new Set(
    (assenzeByDay?.[iso] ?? []).filter((a) => isAssenzaIntera(a)).map((a) => a.staff_id),
  );

  const filtered = filterAssignments(list, filters);
  const sorted = sortAssignments(filtered, sortMode);

  // Rende una lista di assegnazioni: raggruppa in squadre (card fusa) e card singole (assenti saltati).
  const renderItems = (items: Assignment[]) =>
    raggruppaSquadre(items).map((it) => {
      if (it.kind === 'squad') {
        return (
          <SquadraCard
            key={`sq-${it.squadraId}`}
            group={it}
            iso={iso}
            absentIds={absentIds}
            taskCountMap={taskCountMap}
            onSciogli={squadra.onSciogli}
            onRimuoviMembro={squadra.onRimuoviMembro}
            onSetCapo={squadra.onSetCapo}
            onEditMembro={onEdit}
            onDropSingolo={(target, dragged) => squadra.onAggancia(target, dragged)}
            onDragStartMembro={(e, a) =>
              writeAssignmentDragData(e.dataTransfer, {
                id: a.id,
                fromDay: iso,
                fromTerritoryId: a.territory?.id ?? null,
              })
            }
          />
        );
      }
      const a = it.a;
      if (absentIds.has(a.staff?.id ?? '')) return null;
      return (
        <SingoloCard
          key={a.id}
          a={a}
          iso={iso}
          taskCount={taskCountMap?.[`${a.staff?.id}|${iso}`]}
          onDelete={() => onDelete(a)}
          onEdit={onEdit}
          onAggancia={squadra.onAggancia}
        />
      );
    });

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dayData = readDayDragData(e.dataTransfer);
    if (dayData) {
      onDropDay({ fromDay: dayData.fromDay, toDay: d, copy: isCopyDropGesture(e) });
      return;
    }
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

  const hasTerritoryGrouping = sortMode === 'TERRITORIO' || sortMode === 'PER_TERRITORIO';

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
            draggable
            className={`inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-full font-bold active:cursor-grabbing ${
              isToday
                ? 'bg-[var(--brand-primary)] text-[var(--on-primary)] ring-2 ring-[var(--brand-primary)] ring-offset-1'
                : isItalyHoliday(d)
                ? 'text-[var(--danger)]'
                : ''
            }`}
            title="Trascina per spostare l'intero giorno"
            onDragStart={(e) => {
              e.stopPropagation();
              writeDayDragData(e.dataTransfer, { fromDay: iso });
            }}
          >
            {d.getDate()}
          </span>
          {isItalyHoliday(d) && (
            <span className="text-[10px] font-semibold text-[var(--danger)] uppercase tracking-wide">
              Festivo
            </span>
          )}
          {showMonthLabel && <span>{d.toLocaleDateString('it-IT', { month: 'short' })}</span>}
          {(() => {
            const dayId = dayMap[iso]?.id;
            const dayAssignments = dayId ? (assignments[dayId] ?? []) : [];
            const assignedIds = new Set(dayAssignments.map((a) => a.staff?.id).filter(Boolean));
            const unassigned = staffCount - assignedIds.size;
            if (unassigned <= 0) return null;
            return (
              <span
                title={`${unassigned} operator${unassigned === 1 ? 'e' : 'i'} senza assegnazione`}
                className="inline-flex items-center gap-0.5 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warning)]"
              >
                ⚠ {unassigned}
              </span>
            );
          })()}
          {sortMode !== 'AZ' && (
            <button
              onClick={() => props.setSortMode('AZ')}
              className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-[10px] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
              title="Ordina A - Z"
            >
              A-Z
            </button>
          )}
          {(() => {
            const n = props.appointmentCountByIso?.[iso] ?? 0;
            if (n <= 0) return null;
            return (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-primary)' }} title={`${n} appuntamenti`}>
                {n} App.
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAdd(d)}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
          >
            Nuovo
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {(() => {
          const dayAssenze = assenzeByDay?.[iso] ?? [];
          if (!dayAssenze.length) return null;
          return (
            <div className="space-y-1">
              {dayAssenze.map((a) => {
                const meta = TIPO_META[a.tipo];
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onEditAssenza?.(a)}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-110"
                    style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}`, color: meta.text }}
                    title={a.note ?? undefined}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.border }} />
                    <span className="truncate">{a.staff_name} · {labelDisponibilita(a)}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
        {sorted.length ? (
          hasTerritoryGrouping ? (
            (() => {
              const groups: { terrName: string; terrId: string | null; items: Assignment[] }[] = [];
              const idx = new Map<string, number>();
              for (const a of sorted) {
                const key = a.territory?.id ?? '__none__';
                if (!idx.has(key)) {
                  idx.set(key, groups.length);
                  groups.push({ terrName: a.territory?.name ?? '', terrId: a.territory?.id ?? null, items: [] });
                }
                groups[idx.get(key)!].items.push(a);
              }
              return groups.map((g) => {
                const s = getTerritoryStyle(g.terrName || null);
                const key = g.terrId ?? '__none__';
                const collapsed = props.collapsedTerritori?.has(key) ?? false;
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => props.onToggleTerritorio?.(key)}
                      className="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left"
                      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}
                      title={collapsed ? 'Espandi territorio' : 'Comprimi territorio'}
                    >
                      <span className="text-[9px] leading-none" style={{ color: s.text }}>{collapsed ? '▸' : '▾'}</span>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.band }} />
                      <span className="text-[9px] font-semibold uppercase tracking-wide truncate" style={{ color: s.text }}>
                        {g.terrName || 'Senza territorio'}{collapsed ? ` (${g.items.length})` : ''}
                      </span>
                    </button>
                    {!collapsed && <div className="space-y-1">{renderItems(g.items)}</div>}
                  </div>
                );
              });
            })()
          ) : (
            <div className="space-y-1">{renderItems(sorted)}</div>
          )
        ) : (
          <div className="text-xs opacity-50">-</div>
        )}
      </div>
    </div>
  );
}
