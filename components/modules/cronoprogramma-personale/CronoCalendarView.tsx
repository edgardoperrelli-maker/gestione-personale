'use client';

import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import OperatorCard from '@/components/OperatorCard';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import type { Assignment, Staff } from '@/types';
import type { DayRow, SortMode } from './types';
import { getTerritoryStyle } from '@/lib/territoryColors';
import { TIPO_META, labelDisponibilita, isAssenzaIntera, type Disponibilita } from '@/lib/disponibilita';
import { loadCollapsed, saveCollapsed, ASSENZE_APERTE_KEY, WEEKEND_APERTO_KEY } from '@/lib/cronoCollapse';
import { raggruppaSquadre } from './squadre';
import SquadraCard from './SquadraCard';
import {
  eqDate,
  filterAssignments,
  fmtDay,
  indexDays,
  isCopyDropGesture,
  operatoriInMagazzino,
  readAssignmentDragData,
  readDayDragData,
  readSquadDragData,
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
  /** Sposta/copia un'intera squadra su un altro giorno (drag della card-squadra). */
  onDropSquadra: (args: { squadraId: string; fromDay: string; toDay: Date; copyHint: boolean }) => void;
};

const dayBgClass = (d: Date) => {
  if (isItalyHoliday(d)) return 'bg-[var(--hol-bg)]';
  if (isWeekend(d)) return 'bg-[var(--we-bg)]';
  return 'bg-[var(--card-bg)]';
};

/** Le ultime due (indici 5 e 6) sono sabato e domenica in ogni riga-settimana. */
const INTESTAZIONI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/**
 * Auto-scroll durante il trascinamento: avvicinando la card al bordo alto o
 * basso della colonna, la colonna scorre da sola. Serve da quando le colonne
 * hanno un tetto e scorrono dentro di sé — senza, una card non si può portare
 * in una posizione fuori dalla parte visibile.
 */
function useAutoScrollTrascinamento() {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const velocita = useRef(0);

  const ferma = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    velocita.current = 0;
  };

  const passo = () => {
    const el = ref.current;
    if (!el || velocita.current === 0) return ferma();
    el.scrollTop += velocita.current;
    raf.current = requestAnimationFrame(passo);
  };

  const suTrascinamento = (e: DragEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const soglia = 56; // fascia calda ai due bordi
    let v = 0;
    if (e.clientY < r.top + soglia) v = -Math.ceil((r.top + soglia - e.clientY) / 3);
    else if (e.clientY > r.bottom - soglia) v = Math.ceil((e.clientY - (r.bottom - soglia)) / 3);
    velocita.current = Math.max(-24, Math.min(24, v));
    if (velocita.current !== 0 && raf.current == null) raf.current = requestAnimationFrame(passo);
    if (velocita.current === 0) ferma();
  };

  useEffect(() => ferma, []);
  return { ref, suTrascinamento, ferma };
}

/**
 * Sabato/domenica compressi: una striscia verticale al posto della colonna.
 * Il giorno resta visibile e cliccabile — non sparisce, si ritira.
 */
function StrisciaWeekend({ d, isToday, onEspandi }: { d: Date; isToday: boolean; onEspandi: () => void }) {
  const etichetta = d.toLocaleDateString('it-IT', { weekday: 'short' });
  return (
    <button
      type="button"
      onClick={onEspandi}
      title={`Espandi sabato e domenica — ${etichetta} ${d.getDate()}`}
      aria-label={`Espandi il weekend. ${etichetta} ${d.getDate()}`}
      className={`flex h-full min-h-[8rem] flex-col items-center gap-2 rounded-[var(--radius-xl)] border p-2 shadow-[var(--shadow-sm)] transition hover:border-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${dayBgClass(d)} ${
        isToday ? 'border-[var(--brand-primary)] border-t-[3px]' : 'border-[var(--brand-border)]'
      }`}
    >
      <span className="text-sm font-semibold text-[var(--brand-text-main)]">{d.getDate()}</span>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-muted)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        {etichetta}
      </span>
    </button>
  );
}

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
  visibleStaff,
  onPlaceInMagazzino,
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
  /** Operatori rilevanti per il range (per il collocamento automatico in magazzino). */
  visibleStaff?: Staff[];
  /** Click su un operatore "in magazzino": apre la Nuova assegnazione precompilata. */
  onPlaceInMagazzino?: (d: Date, staffId: string) => void;
  taskCountMap?: Record<string, number>;
  assenzeByDay?: Record<string, (Disponibilita & { staff_name: string })[]>;
  onEditAssenza?: (d: Disponibilita) => void;
  appointmentCountByIso?: Record<string, number>;
  squadra: SquadraHandlers;
}) {
  const dayMap = useMemo(() => indexDays(days), [days]);
  const todayIso = fmtDay(today);

  const [collapsedTerritori, setCollapsedTerritori] = useState<Set<string>>(() => new Set(loadCollapsed()));
  const toggleTerritorio = (key: string) =>
    setCollapsedTerritori((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed([...next]);
      return next;
    });

  // Le colonne hanno una LARGHEZZA MINIMA (220px) e crescono a 1fr quando c'è
  // spazio: sotto quella soglia il calendario scorre in orizzontale invece di
  // comprimersi. Prima erano 7 frazioni rigide — a 188px per colonna i nomi
  // degli operatori, cioè il dato che si cerca per primo, arrivavano troncati.
  // Intestazione e righe condividono lo stesso contenitore di scorrimento e la
  // stessa griglia, così restano allineate (prima l'header non aveva il gap).
  //
  // Sabato e domenica si comprimono a una striscia: restano presenti — il conto
  // dei giorni non cambia — ma smettono di valere una colonna piena, perché
  // nella settimana operativa non sono il contenuto che si viene a cercare.
  // Chiave a semantica invertita: senza preferenza salvata il weekend è compresso.
  const weekendCompresso = !collapsedTerritori.has(WEEKEND_APERTO_KEY);
  const toggleWeekend = () => toggleTerritorio(WEEKEND_APERTO_KEY);
  const traccia = (weekend: boolean) =>
    weekend && weekendCompresso ? '2.75rem' : 'minmax(13.75rem, 1fr)';

  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid gap-4">
        <div
          className="grid gap-3 px-1 text-xs font-medium text-[var(--brand-text-muted)]"
          style={{ gridTemplateColumns: INTESTAZIONI.map((_, i) => traccia(i >= 5)).join(' ') }}
        >
          {INTESTAZIONI.map((h, i) =>
            i >= 5 ? (
              // Il comando di vista È l'intestazione: si clicca «Sab» o «Dom» per
              // ridurre il weekend a striscia e per riaprirlo. Prima stava in una
              // riga di bottone sopra la griglia, che rubava una piega di spazio
              // fra la testa di modulo e i giorni.
              <button
                key={h}
                type="button"
                onClick={toggleWeekend}
                aria-pressed={weekendCompresso}
                title={weekendCompresso ? 'Espandi sabato e domenica' : 'Comprimi sabato e domenica'}
                className={`cursor-pointer rounded-[var(--radius-sm)] underline decoration-dotted underline-offset-4 transition hover:text-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                  weekendCompresso ? 'truncate text-center' : 'px-2 text-left'
                }`}
              >
                {h}
              </button>
            ) : (
              <div key={h} className="px-2">
                {h}
              </div>
            ),
          )}
        </div>

        {weeks.map((w, i) => (
          <div key={i} className="grid gap-3" style={{ gridTemplateColumns: w.map((d) => traccia(isWeekend(d))).join(' ') }}>
          {w.map((d: Date) => isWeekend(d) && weekendCompresso ? (
            <StrisciaWeekend key={fmtDay(d)} d={d} isToday={eqDate(d, today)} onEspandi={toggleWeekend} />
          ) : (
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
              visibleStaff={visibleStaff}
              onPlaceInMagazzino={onPlaceInMagazzino}
              todayIso={todayIso}
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
    </div>
  );
}

/** True se il drag in corso è una card assegnazione (non un intero giorno né una squadra). */
function isAssignmentDrag(e: DragEvent<HTMLDivElement>) {
  const t = e.dataTransfer.types;
  return (
    !t.includes('application/x-crono-day') &&
    !t.includes('application/x-crono-squad') &&
    (t.includes('application/json') || t.includes('text/plain'))
  );
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
        className="pointer-events-none absolute -right-1 -top-1 z-10 hidden h-5 w-5 items-center justify-center rounded-full border text-[10px] shadow-[var(--shadow-sm)] group-hover/s:flex"
        style={{ backgroundColor: 'var(--brand-primary-soft)', borderColor: 'var(--brand-primary-border)', color: 'var(--brand-primary)' }}
      >
        ⛓
      </div>
      {/* Feedback ben visibile mentre trascini un'altra card sopra questa */}
      {over && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[var(--radius-lg)]"
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
  visibleStaff?: Staff[];
  onPlaceInMagazzino?: (d: Date, staffId: string) => void;
  todayIso?: string;
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
    visibleStaff,
    onPlaceInMagazzino,
    todayIso,
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

  // Collocamento MAGAZZINO: operatori validi quel giorno senza assegnazione e senza assenza intera.
  // I filtri per attributo dell'assegnazione (ACT/TERR/CC/reperibile) nascondono il gruppo (i "senza
  // attività" non possono soddisfarli); il filtro per operatore invece lo restringe a quegli operatori.
  const staffFilterIds = filters.filter((t) => t.startsWith('STAFF:')).map((t) => t.slice(6));
  const hasNonStaffFilter = filters.some((t) => !t.startsWith('STAFF:'));
  const inMagazzino = hasNonStaffFilter
    ? []
    : operatoriInMagazzino(visibleStaff ?? [], list, absentIds, iso, todayIso).filter(
        (op) => staffFilterIds.length === 0 || staffFilterIds.includes(op.id),
      );

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

  const autoScroll = useAutoScrollTrascinamento();

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    autoScroll.ferma();
    const squadData = readSquadDragData(e.dataTransfer);
    if (squadData) {
      squadra.onDropSquadra({ squadraId: squadData.squadraId, fromDay: squadData.fromDay, toDay: d, copyHint: isCopyDropGesture(e) });
      return;
    }
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
    // «Oggi» ora pesa a livello di COLONNA, non solo sul pallino della data:
    // rail zaffiro in cima + bordo accentato, così l'occhio ci atterra per
    // primo. È lo stato attivo, l'uso che DESIGN.md §1.2 concede all'accento.
    <div
      className={`rounded-[var(--radius-xl)] border p-2 shadow-[var(--shadow-sm)] ${dayBgClass(d)} ${
        isToday
          ? 'border-[var(--brand-primary)] border-t-[3px] border-t-[var(--brand-primary)]'
          : 'border-[var(--brand-border)]'
      } hover:ring-1 hover:ring-[var(--brand-border-strong)]`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = isCopyDropGesture(e) ? 'copy' : 'move';
        autoScroll.suTrascinamento(e);
      }}
      onDragLeave={autoScroll.ferma}
      onDragEnd={autoScroll.ferma}
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
          {/* L'ordinamento è un controllo di vista e ora vive nella testa del
              modulo: qui dentro era ripetuto in ogni colonna (7 copie dello
              stesso comando globale) e apriva una sola delle sei modalità. */}
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
            className="rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            Nuovo
          </button>
        </div>
      </div>

      {/* Ogni colonna scorre DENTRO DI SÉ invece di allungare la pagina: con
          tutti i territori estesi si arrivava a ~1500px per colonna e a crescere
          era il documento, portandosi via l'intestazione dei giorni. Il tetto è
          legato all'altezza della finestra, così la vista resta a schermo. */}
      <div ref={autoScroll.ref} className="mt-2 max-h-[calc(100dvh-20rem)] space-y-2 overflow-y-auto pr-0.5">
        {(() => {
          const dayAssenze = assenzeByDay?.[iso] ?? [];
          if (!dayAssenze.length) return null;

          // Le assenze nascono RIASSUNTE in una riga sola. Prima erano tutte
          // espanse in cima a ogni colonna: 6 chip = 169px, cioè oltre un terzo
          // della piega, moltiplicato per sette giorni — le assegnazioni, che
          // sono il contenuto della pagina, cominciavano sotto. Il conteggio e i
          // tipi restano a vista, quindi non si nasconde nulla: si smette solo
          // di spendere la parte alta della colonna per chi non c'è.
          const aperte = props.collapsedTerritori?.has(ASSENZE_APERTE_KEY) ?? false;
          const perTipo = new Map<string, number>();
          for (const a of dayAssenze) {
            const l = TIPO_META[a.tipo].label;
            perTipo.set(l, (perTipo.get(l) ?? 0) + 1);
          }
          const dettaglio = [...perTipo.entries()]
            .map(([l, n]) => `${n} ${l.toLowerCase()}`)
            .join(', ');

          return (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => props.onToggleTerritorio?.(ASSENZE_APERTE_KEY)}
                aria-expanded={aperte}
                title={aperte ? 'Riassumi le assenze' : 'Mostra le assenze'}
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-1 text-left text-[11px] font-medium text-[var(--brand-text-muted)] transition hover:border-[var(--brand-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                <span className="text-[9px] leading-none">{aperte ? '▾' : '▸'}</span>
                <span className="truncate">
                  <span className="font-semibold text-[var(--brand-text-main)]">{dayAssenze.length}</span>{' '}
                  {dayAssenze.length === 1 ? 'assente' : 'assenti'} · {dettaglio}
                </span>
              </button>
              {aperte && dayAssenze.map((a) => {
                const meta = TIPO_META[a.tipo];
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onEditAssenza?.(a)}
                    className="flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
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
                      className="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-1.5 py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
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
        ) : inMagazzino.length ? null : (
          <div className="text-xs opacity-50">-</div>
        )}

        {inMagazzino.length > 0 && (() => {
          const s = getTerritoryStyle('MAGAZZINO');
          const key = '__magazzino__';
          const collapsed = props.collapsedTerritori?.has(key) ?? false;
          return (
            <div>
              <button
                type="button"
                onClick={() => props.onToggleTerritorio?.(key)}
                className="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left"
                style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}
                title={collapsed ? 'Espandi magazzino' : 'Comprimi magazzino'}
              >
                <span className="text-[9px] leading-none" style={{ color: s.text }}>{collapsed ? '▸' : '▾'}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.band }} />
                <span className="text-[9px] font-semibold uppercase tracking-wide truncate" style={{ color: s.text }}>
                  Magazzino ({inMagazzino.length})
                </span>
              </button>
              {!collapsed && (
                <div className="space-y-1">
                  {inMagazzino.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => onPlaceInMagazzino?.(d, op.id)}
                      className="flex w-full items-center gap-1.5 rounded-lg border border-dashed px-2 py-1 text-left text-[11px] leading-snug shadow-sm transition hover:brightness-105"
                      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text }}
                      title="In magazzino — clic per assegnare un'attività"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold uppercase tracking-tight">
                        {op.display_name}
                      </span>
                      <span className="shrink-0 text-[9px] opacity-70">in magazzino</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
