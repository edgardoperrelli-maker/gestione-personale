'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import InsertReperibileDialog from '@/components/InsertReperibileDialog';
import EditAssignmentDialog from '@/components/EditAssignmentDialog';
import NewAssignmentDialog from '@/components/NewAssignmentDialog';
import ExportAssignmentsDialog from '@/components/ExportAssignmentsDialog';
import type { Assignment, Activity, Staff, Territory } from '@/types';
import CronoToolbar from './CronoToolbar';
import CronoFiltersPanel from './CronoFiltersPanel';
import CronoStats from './CronoStats';
import CronoGridView from './CronoGridView';
import CronoSplitView from './CronoSplitView';
import CronoCalendarView from './CronoCalendarView';
import CronoTableView, { type TableRow } from './CronoTableView';
import type { DayRow, FilterToken, PlannerView, SortMode, ViewMode } from './types';
import {
  addDays,
  capitalize,
  endOfMonth,
  filterAssignments,
  fmtDay,
  indexDayIds,
  indexDays,
  startOfMonth,
  startOfWeek,
  toLocalDate,
} from './utils';

export default function CronoprogrammaWorkspace() {
  const sb = supabaseBrowser();

  const tz = 'Europe/Rome';
  const [today] = useState<Date>(() => toLocalDate(new Date(), tz));
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(today));
  const [mode, setMode] = useState<ViewMode>('week');
  const [plannerView, setPlannerView] = useState<PlannerView>('calendar');

  const [days, setDays] = useState<DayRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});

  const [staff, setStaff] = useState<Staff[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);

  const [dialogOpenForDay, setDialogOpenForDay] = useState<{ id: string; iso: string } | null>(null);
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('AZ');
  const [filters, setFilters] = useState<FilterToken[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [openInsertRep, setOpenInsertRep] = useState(false);
  const [openExport, setOpenExport] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [rev, setRev] = useState(0);
  const softRefresh = () => startTransition(() => setRev((v) => v + 1));

  const confirmTwice = (firstMessage: string, secondMessage: string) => {
    if (typeof window === 'undefined') return true;
    if (!window.confirm(firstMessage)) return false;
    return window.confirm(secondMessage);
  };

  const assignmentSignature = (assignment: Assignment) =>
    [
      assignment.staff?.id ?? '',
      assignment.activity?.id ?? '',
      assignment.territory?.id ?? '',
      assignment.reperibile ? '1' : '0',
      assignment.notes ?? '',
      assignment.cost_center ?? '',
    ].join('|');

  const assignmentConflictKey = (assignment: Assignment) =>
    assignment.staff?.id ? `staff:${assignment.staff.id}` : assignmentSignature(assignment);

  const fetchAssignmentsForDay = async (dayId: string) => {
    const ares = await sb
      .from('assignments')
      .select(`
        id, day_id, reperibile, notes, cost_center,
        staff:staff_id ( id, display_name ),
        territory:territory_id ( id, name ),
        activity:activity_id ( id, name )
      `)
      .eq('day_id', dayId)
      .order('created_at', { ascending: true });

    if (ares.error) return null;

    type RawAssignment = Omit<Assignment, 'staff' | 'territory' | 'activity'> & {
      staff?: Assignment['staff'] | Array<NonNullable<Assignment['staff']>> | null;
      territory?: Assignment['territory'] | Array<NonNullable<Assignment['territory']>> | null;
      activity?: Assignment['activity'] | Array<NonNullable<Assignment['activity']>> | null;
    };

    return ((ares.data ?? []) as RawAssignment[]).map((row) => ({
      ...row,
      staff: firstRelation(row.staff ?? null),
      territory: firstRelation(row.territory ?? null),
      activity: firstRelation(row.activity ?? null),
    })) as Assignment[];
  };

  const toggleToken = (t: string) => {
    setFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const range = useMemo(() => {
    if (mode === 'week') {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 6);
      return { start: ws, end: we };
    }
    if (mode === 'twoWeeks') {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 13);
      return { start: ws, end: we };
    }
    const first = startOfMonth(anchor);
    const last = endOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(startOfWeek(addDays(last, 6)), 6);
    return { start: gridStart, end: gridEnd };
  }, [anchor, mode]);

  const daysArray = useMemo(() => {
    const arr: Date[] = [];
    for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) arr.push(new Date(d));
    return arr;
  }, [range]);

  const weeks = useMemo(() => {
    const w: Date[][] = [];
    for (let i = 0; i < daysArray.length; i += 7) w.push(daysArray.slice(i, i + 7));
    return w;
  }, [daysArray]);

  const dayMap = useMemo(() => indexDays(days), [days]);
  const dayIdMap = useMemo(() => indexDayIds(days), [days]);

  const firstRelation = <T,>(value: T | T[] | null): T | null => {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [sRes, aRes, tRes] = await Promise.all([
        sb.from('staff').select('id, display_name').order('display_name', { ascending: true }),
        sb.from('activities_renamed').select('id, name').order('name', { ascending: true }),
        sb.from('territories').select('id, name').order('name', { ascending: true }),
      ]);
      if (!alive) return;

      if (!sRes.error && sRes.data) setStaff(sRes.data as Staff[]);
      if (!aRes.error && aRes.data) setActivities(aRes.data as Activity[]);
      if (!tRes.error && tRes.data) setTerritories(tRes.data as Territory[]);
    })();
    return () => {
      alive = false;
    };
  }, [sb]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const from = fmtDay(range.start);
      const to = fmtDay(range.end);

      const dres = await sb
        .from('calendar_days')
        .select('id, day, note')
        .gte('day', from)
        .lte('day', to)
        .order('day');
      if (dres.error || !alive) return;

      const dayRows = (dres.data ?? []) as DayRow[];
      const ids = dayRows.map((r) => r.id);

      const map: Record<string, Assignment[]> = {};
      if (ids.length) {
        const ares = await sb
          .from('assignments')
          .select(`
            id, day_id, reperibile, notes, cost_center,
            staff:staff_id ( id, display_name ),
            territory:territory_id ( id, name ),
            activity:activity_id ( id, name )
          `)
          .in('day_id', ids)
          .order('created_at', { ascending: true });

        if (ares.error || !alive) return;

        type RawAssignment = Omit<Assignment, 'staff' | 'territory' | 'activity'> & {
          staff?: Assignment['staff'] | Array<NonNullable<Assignment['staff']>> | null;
          territory?: Assignment['territory'] | Array<NonNullable<Assignment['territory']>> | null;
          activity?: Assignment['activity'] | Array<NonNullable<Assignment['activity']>> | null;
        };

        const rows = ((ares.data ?? []) as RawAssignment[]).map((row) => ({
          ...row,
          staff: firstRelation(row.staff ?? null),
          territory: firstRelation(row.territory ?? null),
          activity: firstRelation(row.activity ?? null),
        })) as Assignment[];

        rows.forEach((a) => {
          if (!map[a.day_id]) map[a.day_id] = [];
          map[a.day_id].push(a);
        });
      }

      Object.keys(map).forEach((k) => {
        map[k].sort((a, b) =>
          (a.staff?.display_name ?? '').localeCompare(b.staff?.display_name ?? '', 'it', {
            sensitivity: 'base',
          })
        );
      });
      if (!alive) return;
      setDays(dayRows);
      setAssignments(map);
    })();
    return () => {
      alive = false;
    };
  }, [range.start, range.end, sb, rev]);

  const removeAssignment = async (a: Assignment) => {
    setActionFeedback(null);
    const prev = assignments;
    setAssignments((prevMap) => {
      const next: Record<string, Assignment[]> = {};
      for (const k of Object.keys(prevMap)) next[k] = (prevMap[k] ?? []).filter((x) => x.id !== a.id);
      return next;
    });

    const { error } = await sb.rpc('delete_assignment', { p_id: a.id });
    if (error) {
      setAssignments(prev);
      softRefresh();
      return;
    }
    setTimeout(() => softRefresh(), 300);
  };

  const openEditDialog = (a: Assignment) => {
    setEditAssignment(a);
  };

  const openNewForDate = async (d: Date) => {
    const iso = fmtDay(d);

    const existing = dayMap[iso];
    if (existing) {
      setDialogOpenForDay({ id: existing.id, iso });
      return;
    }

    const { data: { user } } = await sb.auth.getUser();
    const res = await fetch('/api/calendar/upsert-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: undefined,
        day: iso,
        note: null,
        user_id: user?.id,
        version: undefined,
      }),
    });

    if (res.status === 409) {
      const { current } = await res.json();
      if (current?.id) setDialogOpenForDay({ id: current.id, iso });
      return;
    }
    if (!res.ok) return;

    const { row } = await res.json();
    if (!row?.id) return;

    setDays((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, { id: row.id, day: row.day }]));
    setDialogOpenForDay({ id: row.id, iso });
  };

  const ensureDayId = async (iso: string) => {
    const existing = dayMap[iso];
    if (existing) return existing.id;

    const { data: { user } } = await sb.auth.getUser();
    const res = await fetch('/api/calendar/upsert-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: undefined,
        day: iso,
        note: null,
        user_id: user?.id,
        version: undefined,
      }),
    });

    if (res.status === 409) {
      const { current } = await res.json();
      if (current?.id) return current.id as string;
      return null;
    }
    if (!res.ok) return null;

    const { row } = await res.json();
    if (!row?.id) return null;

    setDays((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, { id: row.id, day: row.day }]));
    return row.id as string;
  };

  const findAssignmentById = (id: string) => {
    for (const [dayId, list] of Object.entries(assignments)) {
      const found = list.find((a) => a.id === id);
      if (found) return { dayId, assignment: found };
    }
    return null;
  };

  const handleDropAssignment = async ({
    assignmentId,
    fromDay,
    fromTerritoryId,
    toDay,
    toTerritoryId,
    copy,
  }: {
    assignmentId: string;
    fromDay: string;
    fromTerritoryId: string | null;
    toDay: Date;
    toTerritoryId: string | null;
    copy: boolean;
  }) => {
    setActionFeedback(null);
    const found = findAssignmentById(assignmentId);
    if (!found) return;

    const targetIso = fmtDay(toDay);
    const targetDayId = await ensureDayId(targetIso);
    if (!targetDayId) return;

    if (!copy && fromDay === targetIso && fromTerritoryId === toTerritoryId) return;

    if (
      !copy &&
      !confirmTwice(
        `Confermi lo spostamento della card dal ${fromDay} al ${targetIso}?`,
        `Ultima conferma: la card verra rimossa dal ${fromDay} e spostata definitivamente al ${targetIso}.`
      )
    ) {
      return;
    }

    const terrName = toTerritoryId
      ? territories.find((t) => t.id === toTerritoryId)?.name ?? ''
      : null;

    const targetAssignments = await fetchAssignmentsForDay(targetDayId);
    if (!targetAssignments) {
      setActionFeedback({
        type: 'error',
        text: `Impossibile verificare il contenuto del giorno ${targetIso}.`,
      });
      return;
    }

    const targetPreview: Assignment = {
      ...found.assignment,
      day_id: targetDayId,
      territory: toTerritoryId ? { id: toTerritoryId, name: terrName ?? '' } : null,
    };

    const conflictingAssignments = targetAssignments.filter((assignment) => {
      if (assignment.id === found.assignment.id) return false;
      return assignmentConflictKey(assignment) === assignmentConflictKey(targetPreview);
    });

    const conflictIds = conflictingAssignments.map((assignment) => assignment.id);
    if (conflictIds.length) {
      const label = found.assignment.staff?.display_name ?? 'questa card';
      const shouldOverwrite =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              `${label} e gia presente nel giorno ${targetIso}. Vuoi sovrascrivere i dati esistenti?`
            );

      if (!shouldOverwrite) {
        setActionFeedback({
          type: 'error',
          text: `Operazione annullata: nessun dato sovrascritto nel giorno ${targetIso}.`,
        });
        return;
      }

      const del = await sb.from('assignments').delete().in('id', conflictIds);
      if (del.error) {
        setActionFeedback({
          type: 'error',
          text: `Impossibile sovrascrivere i dati nel giorno ${targetIso}.`,
        });
        softRefresh();
        return;
      }
    }

    if (copy) {
      const ins = await sb
        .from('assignments')
        .insert({
          day_id: targetDayId,
          staff_id: found.assignment.staff?.id ?? null,
          activity_id: found.assignment.activity?.id ?? null,
          territory_id: toTerritoryId ?? null,
          reperibile: found.assignment.reperibile,
          notes: found.assignment.notes ?? null,
          cost_center: found.assignment.cost_center ?? null,
        })
        .select('id, day_id')
        .single();

      if (ins.error || !ins.data) {
        softRefresh();
        return;
      }

      const newAssignment: Assignment = {
        ...found.assignment,
        id: ins.data.id,
        day_id: ins.data.day_id,
        territory: toTerritoryId ? { id: toTerritoryId, name: terrName ?? '' } : null,
      };

      setAssignments((prev) => {
        const next = { ...prev };
        next[targetDayId] = [
          ...(next[targetDayId] ?? []).filter((assignment) => !conflictIds.includes(assignment.id)),
          newAssignment,
        ];
        return next;
      });

      return;
    }

    const upd = await sb
      .from('assignments')
      .update({ day_id: targetDayId, territory_id: toTerritoryId })
      .eq('id', found.assignment.id);

    if (upd.error) {
      softRefresh();
      return;
    }

    const updatedAssignment: Assignment = {
      ...found.assignment,
      day_id: targetDayId,
      territory: toTerritoryId ? { id: toTerritoryId, name: terrName ?? '' } : null,
    };

    setAssignments((prev) => {
      const next: Record<string, Assignment[]> = {};
      for (const [dayId, list] of Object.entries(prev)) {
        if (dayId === found.dayId) {
          next[dayId] = list.filter(
            (a) => a.id !== found.assignment.id && !(dayId === targetDayId && conflictIds.includes(a.id))
          );
        } else {
          next[dayId] = dayId === targetDayId ? list.filter((a) => !conflictIds.includes(a.id)) : list;
        }
      }
      next[targetDayId] = [...(next[targetDayId] ?? []), updatedAssignment];
      return next;
    });
  };

  const copyDayToNextDay = async (sourceDay: Date) => {
    setActionFeedback(null);

    const sourceIso = fmtDay(sourceDay);
    const sourceDayRow = dayMap[sourceIso];
    const sourceAssignments = sourceDayRow ? assignments[sourceDayRow.id] ?? [] : [];

    if (!sourceAssignments.length) {
      setActionFeedback({
        type: 'error',
        text: `Nessuna card da copiare nel giorno ${sourceIso}.`,
      });
      return;
    }

    const targetDate = addDays(sourceDay, 1);
    const targetIso = fmtDay(targetDate);

    if (
      !confirmTwice(
        `Vuoi copiare tutte le card del ${sourceIso} al giorno successivo ${targetIso}?`,
        `Ultima conferma: verranno create nuove card per il ${targetIso}.`
      )
    ) {
      return;
    }

    const targetDayId = await ensureDayId(targetIso);
    if (!targetDayId) {
      setActionFeedback({
        type: 'error',
        text: `Impossibile preparare il giorno ${targetIso}.`,
      });
      return;
    }

    const existingTargetAssignments = await fetchAssignmentsForDay(targetDayId);
    if (!existingTargetAssignments) {
      setActionFeedback({
        type: 'error',
        text: `Impossibile verificare il contenuto del giorno ${targetIso}.`,
      });
      return;
    }

    if (existingTargetAssignments.length > 0) {
      const shouldOverwrite =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              `Il giorno ${targetIso} contiene gia ${existingTargetAssignments.length} card. Vuoi sovrascrivere i dati esistenti?`
            );

      if (!shouldOverwrite) {
        setActionFeedback({
          type: 'error',
          text: `Operazione annullata: il giorno ${targetIso} non e stato modificato.`,
        });
        return;
      }

      const del = await sb
        .from('assignments')
        .delete()
        .in(
          'id',
          existingTargetAssignments.map((assignment) => assignment.id)
        );

      if (del.error) {
        setActionFeedback({
          type: 'error',
          text: `Impossibile sovrascrivere il giorno ${targetIso}.`,
        });
        softRefresh();
        return;
      }
    }

    const insertPayload = sourceAssignments.map((assignment) => ({
      day_id: targetDayId,
      staff_id: assignment.staff?.id ?? null,
      activity_id: assignment.activity?.id ?? null,
      territory_id: assignment.territory?.id ?? null,
      reperibile: assignment.reperibile,
      notes: assignment.notes ?? null,
      cost_center: assignment.cost_center ?? null,
    }));

    const ins = await sb.from('assignments').insert(insertPayload);

    if (ins.error) {
      setActionFeedback({
        type: 'error',
        text: `Copia non riuscita verso ${targetIso}.`,
      });
      softRefresh();
      return;
    }

    setActionFeedback({
      type: 'success',
      text:
        existingTargetAssignments.length > 0
          ? `Copiate ${sourceAssignments.length} card al ${targetIso} dopo sovrascrittura.`
          : `Copiate ${sourceAssignments.length} card al ${targetIso}.`,
    });
    softRefresh();
  };

  const title = useMemo(() => {
    if (mode === 'month') {
      const it = anchor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      return capitalize(it);
    }
    const s = range.start.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const e = range.end.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${s} - ${e}`;
  }, [anchor, mode, range]);

  const goPrev = () => {
    if (mode === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
    else if (mode === 'twoWeeks') setAnchor(addDays(anchor, -14));
    else setAnchor(addDays(anchor, -7));
    softRefresh();
  };
  const goNext = () => {
    if (mode === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
    else if (mode === 'twoWeeks') setAnchor(addDays(anchor, 14));
    else setAnchor(addDays(anchor, 7));
    softRefresh();
  };
  const goToday = () => {
    setAnchor(startOfWeek(today));
    softRefresh();
  };

  const gotoMode = (m: ViewMode) => {
    setMode(m);
    if (m === 'week' || m === 'twoWeeks') setAnchor(startOfWeek(today));
    softRefresh();
  };

  const allAssignments = useMemo(() => Object.values(assignments).flat(), [assignments]);
  const filteredAssignments = useMemo(() => filterAssignments(allAssignments, filters), [allAssignments, filters]);

  const statsSource = filters.length ? filteredAssignments : allAssignments;
  const stats = useMemo(() => {
    const staffIds = new Set<string>();
    let reperibili = 0;
    statsSource.forEach((a) => {
      if (a.staff?.id) staffIds.add(a.staff.id);
      if (a.reperibile) reperibili += 1;
    });
    return {
      total: statsSource.length,
      staff: staffIds.size,
      reperibili,
    };
  }, [statsSource]);

  const visibleTerritories = useMemo(() => {
    const terrFilterIds = filters.filter((t) => t.startsWith('TERR:')).map((t) => t.slice(5));
    if (terrFilterIds.length === 0) return territories;
    return territories.filter((t) => terrFilterIds.includes(t.id));
  }, [territories, filters]);

  const includeNoTerritory = filteredAssignments.some((a) => !a.territory?.id);

  const assignmentsByCell = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    Object.entries(assignments).forEach(([dayId, list]) => {
      const iso = dayIdMap[dayId];
      if (!iso) return;
      const filtered = filterAssignments(list, filters);
      filtered.forEach((a) => {
        const terrId = a.territory?.id ?? 'none';
        const key = `${iso}|${terrId}`;
        (map[key] ??= []).push(a);
      });
    });
    return map;
  }, [assignments, dayIdMap, filters]);

  const tableRows: TableRow[] = useMemo(() => {
    const rows: TableRow[] = [];
    Object.entries(assignments).forEach(([dayId, list]) => {
      const day = dayIdMap[dayId];
      if (!day) return;
      const filtered = filterAssignments(list, filters);
      filtered.forEach((a) => rows.push({ day, assignment: a }));
    });
    rows.sort((a, b) => a.day.localeCompare(b.day) || (a.assignment.staff?.display_name ?? '').localeCompare(b.assignment.staff?.display_name ?? ''));
    return rows;
  }, [assignments, dayIdMap, filters]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-1 space-y-4 bg-[var(--brand-surface)]/95 px-1 pb-4 pt-1 backdrop-blur supports-[backdrop-filter]:bg-[var(--brand-surface)]/88">
        <CronoToolbar
          title={title}
          mode={mode}
          plannerView={plannerView}
          sortMode={sortMode}
          filtersCount={filters.length}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onModeChange={gotoMode}
          onPlannerViewChange={setPlannerView}
          onSortModeChange={setSortMode}
          onToggleFilters={() => setFiltersOpen((v) => !v)}
          onInsertRep={() => setOpenInsertRep(true)}
          onExport={() => setOpenExport(true)}
        />

        <CronoFiltersPanel
          open={filtersOpen}
          filters={filters}
          staff={staff}
          activities={activities}
          territories={territories}
          onToggle={toggleToken}
          onClear={() => setFilters([])}
        />

        {actionFeedback && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            style={
              actionFeedback.type === 'success'
                ? { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#166534' }
                : { borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }
            }
          >
            {actionFeedback.text}
          </div>
        )}

        <CronoStats total={stats.total} staff={stats.staff} reperibili={stats.reperibili} />
      </div>

      {plannerView === 'grid' && (
        <CronoGridView
          days={daysArray}
          today={today}
          assignmentsByCell={assignmentsByCell}
          territories={visibleTerritories}
          includeNoTerritory={includeNoTerritory}
          sortMode={sortMode}
          onAdd={openNewForDate}
          onCopyDayToNext={copyDayToNextDay}
          onEdit={openEditDialog}
          onDelete={removeAssignment}
          onDropAssignment={handleDropAssignment}
        />
      )}

      {plannerView === 'calendar' && (
        <CronoCalendarView
          weeks={mode === 'week' ? [weeks[0] ?? []] : weeks}
          anchor={anchor}
          today={today}
          days={days}
          assignments={assignments}
          onAdd={openNewForDate}
          onCopyDayToNext={copyDayToNextDay}
          showMonthLabels={mode === 'month'}
          sortMode={sortMode}
          filters={filters}
          setSortMode={setSortMode}
          onDelete={removeAssignment}
          onEdit={openEditDialog}
          onDropAssignment={handleDropAssignment}
        />
      )}

      {plannerView === 'table' && (
        <CronoTableView rows={tableRows} onEdit={openEditDialog} onDelete={removeAssignment} />
      )}

      {plannerView === 'split' && (
        <CronoSplitView
          days={daysArray}
          today={today}
          territories={visibleTerritories}
          includeNoTerritory={includeNoTerritory}
          assignmentsByCell={assignmentsByCell}
          sortMode={sortMode}
          onAdd={openNewForDate}
          onCopyDayToNext={copyDayToNextDay}
          onEdit={openEditDialog}
          onDelete={removeAssignment}
          onDropAssignment={handleDropAssignment}
        />
      )}

      {dialogOpenForDay
        ? (() => {
            const { id: dayId, iso } = dialogOpenForDay;
            const excludeIds = new Set(
              (assignments[dayId] ?? [])
                .map((a) => a?.staff?.id ?? '')
                .filter((id) => id !== '')
            );
            const availableStaffForDay = (staff ?? []).filter((s) => !excludeIds.has(s.id));

            return (
              <NewAssignmentDialog
                dayId={dayId}
                iso={iso}
                staffList={availableStaffForDay}
                actList={activities}
                terrList={territories}
                onClose={() => setDialogOpenForDay(null)}
                onCreated={(row: Assignment, close = true) => {
                  const bucket = row.day_id;

                  setDays((prev) => {
                    const exists = prev.some((r) => r.id === bucket);
                    if (exists) return prev;
                    const isoX = (row as unknown as { __iso?: string }).__iso;
                    if (!isoX) return prev;
                    return [...prev, { id: bucket, day: isoX }];
                  });

                  setAssignments((prev) => {
                    const arr = prev[bucket] ? [...prev[bucket]] : [];
                    const i = arr.findIndex((x) => x.id === row.id);
                    if (i >= 0) arr[i] = row;
                    else arr.push(row);

                    const seen = new Set<string>();
                    const dedup = arr.filter((a) => {
                      const fresh = !seen.has(a.id);
                      if (fresh) seen.add(a.id);
                      return fresh;
                    });
                    dedup.sort((a, b) =>
                      (a.staff?.display_name ?? '').localeCompare(b.staff?.display_name ?? '', 'it', {
                        sensitivity: 'base',
                      })
                    );

                    return { ...prev, [bucket]: dedup };
                  });

                  if (close) setDialogOpenForDay(null);
                }}
              />
            );
          })()
        : null}

      {editAssignment
        ? (() => {
            const a0 = editAssignment;
            const dayId = a0.day_id;

            const excludeIds = new Set(
              (assignments[dayId] ?? [])
                .map((a) => a?.staff?.id ?? '')
                .filter((id) => id !== '' && id !== (a0.staff?.id ?? ''))
            );
            const availableStaffForEdit = (staff ?? []).filter(
              (s) => s.id === (a0.staff?.id ?? '') || !excludeIds.has(s.id)
            );

            return (
              <EditAssignmentDialog
                assignment={a0}
                staffList={availableStaffForEdit}
                actList={activities}
                terrList={territories}
                onClose={() => setEditAssignment(null)}
                onSaved={(updated, close = true) => {
                  setAssignments((prev) => {
                    const arr = [...(prev[updated.day_id] ?? [])];
                    const i = arr.findIndex((x) => x.id === updated.id);
                    if (i >= 0) arr[i] = updated;
                    return { ...prev, [updated.day_id]: arr };
                  });
                  if (close) setEditAssignment(null);
                }}
                onDeleted={(a) => {
                  setEditAssignment(null);
                  removeAssignment(a);
                }}
              />
            );
          })()
        : null}

      <InsertReperibileDialog
        open={openInsertRep}
        onClose={() => setOpenInsertRep(false)}
        staffList={staff}
        terrList={territories}
        onInserted={() => {
          setOpenInsertRep(false);
          softRefresh();
        }}
      />

      <ExportAssignmentsDialog
        open={openExport}
        onClose={() => setOpenExport(false)}
        defaultFrom={range.start.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10)}
        defaultTo={range.end.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10)}
      />
    </div>
  );
}
