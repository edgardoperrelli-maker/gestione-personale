'use client';
import InsertReperibileDialog from '@/components/InsertReperibileDialog';
import { isItalyHoliday, isWeekend } from '@/utils/date-it';
import EditAssignmentDialog from '../../components/EditAssignmentDialog';
import { useEffect, useMemo, useState, startTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import NewAssignmentDialog from '@/components/NewAssignmentDialog';
import OperatorCard from '@/components/OperatorCard';
import Link from 'next/link'


type Role = 'viewer'|'editor'|'admin';
type DayRow = { id:string; day:string; note?:string };
import type { Assignment, Staff, Activity, Territory } from '@/types';

type ViewMode = 'month'|'twoWeeks'|'week';
type SortMode = 'AZ'|'REPERIBILE'|'ATTIVITA'|'TERRITORIO'|'SENZA_ATTIVITA'|'PER_TERRITORIO';

export default function DashboardPage() {
  const sb = supabaseBrowser();

  const tz = 'Europe/Rome';
  const [today] = useState<Date>(() => toLocalDate(new Date(), tz));
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(today));
  const [mode, setMode] = useState<ViewMode>('month');

  
  const [role, setRole] = useState<Role>('viewer');


  const [meEmail, setMeEmail] = useState<string>('');

  const [days, setDays] = useState<DayRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});

  const [staff, setStaff] = useState<Staff[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);

  const [dialogOpenForDay, setDialogOpenForDay] = useState<{id:string; iso:string}|null>(null);
  const [editAssignment, setEditAssignment] = useState<Assignment|null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('AZ');
  const [filter, setFilter] = useState<string>('NONE');
const [openInsertRep, setOpenInsertRep] = useState(false);

  const [rev, setRev] = useState(0);
  const softRefresh = () => startTransition(() => setRev(v => v + 1));

  // ---- date helpers ----
 function toLocalDate(d: Date, tz: string) {
  const s = d.toLocaleString('sv-SE', { timeZone: tz });
  return new Date(s.replace(' ', 'T'));
}

  function startOfWeek(d: Date) {
    const dd = new Date(d);
    const day = (dd.getDay()+6)%7; // Mon=0..Sun=6
    dd.setDate(dd.getDate()-day);
    dd.setHours(0,0,0,0);
    return dd;
  }
  function addDays(d: Date, n: number) {
    const x = new Date(d); x.setDate(x.getDate()+n); return x;
  }
  function startOfMonth(d: Date) {
    const m = new Date(d.getFullYear(), d.getMonth(), 1); m.setHours(0,0,0,0); return m;
  }
  function endOfMonth(d: Date) {
    const m = new Date(d.getFullYear(), d.getMonth()+1, 0); m.setHours(0,0,0,0); return m;
  }

  // ---- visible range by mode ----
  const range = useMemo(() => {
    if (mode==='week') {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 6);
      return { start: ws, end: we };
    }
    if (mode==='twoWeeks') {
      const ws = startOfWeek(anchor);
      const we = addDays(ws, 13);
      return { start: ws, end: we };
    }
    const first = startOfMonth(anchor);
    const last  = endOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const gridEnd   = addDays(startOfWeek(addDays(last,6)),6);
    return { start: gridStart, end: gridEnd };
  }, [anchor, mode]);

  const daysArray = useMemo(() => {
    const arr: Date[] = [];
    for (let d = new Date(range.start); d<=range.end; d = addDays(d,1)) arr.push(new Date(d));
    return arr;
  }, [range]);

  const weeks = useMemo(() => {
    const w: Date[][] = [];
    for (let i=0;i<daysArray.length;i+=7) w.push(daysArray.slice(i,i+7));
    return w;
  }, [daysArray]);


// ---- load identity + lists ----
useEffect(() => {
  (async () => {
    const { data: { session }, error: eS } = await sb.auth.getSession();
    console.log('[DBG] getSession err=', eS, 'uid=', session?.user?.id, 'email=', session?.user?.email);

    const uid = session?.user?.id ?? null;
    const email = session?.user?.email ?? '';

    let shown = email;
    let roleLocal: Role = 'viewer';

    if (uid) {
      const q1 = await sb.from('profiles').select('username, role').eq('id', uid).maybeSingle();
      console.log('[DBG] profiles by id ->', q1);
      const p = q1.data ?? (await sb.from('profiles').select('username, role').eq('email', email).maybeSingle()).data ?? null;
      console.log('[DBG] profiles final ->', p);

      if (p) {
        shown = p.username ?? email;
        roleLocal = (p.role as Role) ?? 'viewer';
      }
    }

    setMeEmail(shown);
    setRole(roleLocal);
  })();
}, []);

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
  return () => { alive = false; };
}, [sb]);


  // ---- load days + assignments for visible range ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const from = fmtDay(range.start);
      const to   = fmtDay(range.end);

      const dres = await sb.from('calendar_days')
        .select('id, day, note')
        .gte('day', from).lte('day', to)
        .order('day');
      if (dres.error || !alive) return;

      const dayRows = (dres.data ?? []) as DayRow[];
      const ids = dayRows.map(r => r.id);

      const map: Record<string, Assignment[]> = {};
      if (ids.length) {
        const ares = await sb
          .from('assignments')
          .select(`
            id, day_id, reperibile, notes,
            staff:staff_id ( id, display_name ),
            territory:territory_id ( id, name ),
            activity:activity_id ( id, name )
          `)
          .in('day_id', ids)
          .order('created_at', { ascending: true });
        if (ares.error || !alive) return;

      const rows = ((ares.data ?? []) as unknown) as Assignment[];

rows.forEach((a) => {
  if (!map[a.day_id]) map[a.day_id] = [];
  map[a.day_id].push(a);
});

      }

      Object.keys(map).forEach(k => {
        map[k].sort((a,b) => (a.staff?.display_name ?? '').localeCompare(b.staff?.display_name ?? '','it',{sensitivity:'base'}));
      });
      if (!alive) return;
      setDays(dayRows);
      setAssignments(map);
    })();
    return () => { alive = false; };
  }, [range.start, range.end, sb, rev]);

  const dayMap = useMemo(()=>indexDays(days), [days]);
// elimina assegnazione via RPC
const removeAssignment = async (a: Assignment) => {
  const prev = assignments;
  setAssignments(prevMap => {
    const next: Record<string, Assignment[]> = {};
    for (const k of Object.keys(prevMap)) next[k] = (prevMap[k] ?? []).filter(x => x.id !== a.id);
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

  // apertura modale “Modifica”
const openEditDialog = (a: Assignment) => {
  setEditAssignment(a); // apre modale di modifica
};

// apertura veloce modale “Nuovo”
const openNewForDate = async (d: Date) => {
  const iso = fmtDay(d);

  const existing = dayMap[iso];
  if (existing) { setDialogOpenForDay({ id: existing.id, iso }); return; }

  // user_id per RLS
  const { data: { user } } = await sb.auth.getUser();
  const res = await fetch('/api/calendar/upsert-day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: undefined,
      day: iso,
      note: null,
      user_id: user?.id,
      version: undefined           // nuovo record: nessuna versione
    })
  });

  if (res.status === 409) {
    const { current } = await res.json();
    if (current?.id) setDialogOpenForDay({ id: current.id, iso });
    return;
  }
  if (!res.ok) return;

  const { row } = await res.json(); // { id, day, ... }
  if (!row?.id) return;

  setDays(prev => prev.some(x => x.id === row.id) ? prev : [...prev, { id: row.id, day: row.day }]);
  setDialogOpenForDay({ id: row.id, iso });
};



  // ---- top controls ----
  const title = useMemo(() => {
    if (mode==='month') {
      const it = anchor.toLocaleDateString('it-IT', { month:'long', year:'numeric' });
      return capitalize(it);
    }
    const s = range.start.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' });
    const e = range.end.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
    return `${s} – ${e}`;
  }, [anchor, mode, range]);

  const goPrev = () => {
    if (mode==='month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()-1, 1));
    else if (mode==='twoWeeks') setAnchor(addDays(anchor,-14));
    else setAnchor(addDays(anchor,-7));
    softRefresh();
  };
  const goNext = () => {
    if (mode==='month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth()+1, 1));
    else if (mode==='twoWeeks') setAnchor(addDays(anchor,14));
    else setAnchor(addDays(anchor,7));
    softRefresh();
  };
  const goToday = () => { setAnchor(startOfWeek(today)); softRefresh(); };

  const gotoMode = (m: ViewMode) => {
    setMode(m);
    if (m === 'week' || m === 'twoWeeks') setAnchor(startOfWeek(today));
    softRefresh();
  };

  const onLogout = async () => {
    await sb.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="p-4 space-y-4 min-h-screen">

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="px-2 py-1 rounded-lg border bg-white shadow-sm hover:bg-gray-50">←</button>
          <div className="text-2xl font-semibold tracking-tight">{title}</div>
          <button onClick={goNext} className="px-2 py-1 rounded-lg border bg-white shadow-sm hover:bg-gray-50">→</button>

          <div className="ml-3 inline-flex rounded-xl border bg-white shadow-sm overflow-hidden">
            <SegBtn active={mode==='week'} onClick={()=>gotoMode('week')}>Settimana</SegBtn>
            <SegBtn active={mode==='twoWeeks'} onClick={()=>gotoMode('twoWeeks')}>2 settimane</SegBtn>
            <SegBtn active={mode==='month'} onClick={()=>gotoMode('month')}>Mese</SegBtn>
          </div>

          <button onClick={goToday} className="ml-2 px-3 py-1.5 rounded-xl border bg-white shadow-sm hover:bg-gray-50">
            Oggi
          </button>

          {/* Filtra */}
          <div className="ml-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Filtra</span>
              <select
                className="px-2 py-1.5 text-sm border rounded-lg bg-white shadow-sm min-w-44"
                value={filter}
                onChange={(e)=>setFilter(e.target.value)}
              >
                <option value="NONE">— Nessun filtro —</option>
                <option value="REPERIBILE">Solo reperibili</option>
                <optgroup label="Operatori">
                  {staff.map(s=>(
                    <option key={s.id} value={`STAFF:${s.id}`}>{s.display_name}</option>
                  ))}
                </optgroup>
                <optgroup label="Attività">
                  {activities.map(a=>(
                    <option key={a.id} value={`ACT:${a.id}`}>{a.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Territori">
                  {territories.map(t=>(
                    <option key={t.id} value={`TERR:${t.id}`}>{t.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Ordina */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Ordina</span>
              <select
                className="px-2 py-1.5 text-sm border rounded-lg bg-white shadow-sm"
                value={sortMode}
                onChange={(e)=>setSortMode(e.target.value as SortMode)}
              >
                <option value="AZ">A → Z</option>
                <option value="REPERIBILE">Reperibile</option>
                <option value="ATTIVITA">Attività</option>
                <option value="TERRITORIO">Territorio</option>
                <option value="SENZA_ATTIVITA">Senza attività</option>
                <option value="PER_TERRITORIO">Per territorio</option>
              </select>
            </div>
                   </div>

          {/* NUOVO: tasto Inserisci Reperibile */}
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
              onClick={() => setOpenInsertRep(true)}
              title="Inserisci Reperibile"
            >
              Inserisci Reperibile
            </button>
          </div>
        </div>

<div className="flex items-center gap-2 text-sm">
  <Link
    href="/hub"
    className="px-2 py-1 rounded-lg border bg-white shadow-sm hover:bg-gray-50"
    aria-label="Torna all’Hub"
  >
    ← Hub
  </Link>

  <span className="opacity-70">{meEmail} · ruolo: {role}</span>
  <form action="/api/logout" method="post">
    <button type="submit" className="px-2 py-1 rounded-lg border bg-white shadow-sm hover:bg-gray-50">
      Logout
    </button>
  </form>
</div>


      </div>

      {/* calendar */}
{mode==='week' ? (
  <WeeksGrid
    weeks={[weeks[0] ?? []]}   // una sola riga di 7 “quadrotti”
    anchor={anchor}
    today={today}
    role={role}
    days={days}
    assignments={assignments}
    onAdd={(d)=>openNewForDate(d)}
    showMonthLabels={false}
    sortMode={sortMode}
    filter={filter}
    setSortMode={setSortMode}
    onDelete={removeAssignment}
    onEdit={openEditDialog}
  />
) : (
  <WeeksGrid
    weeks={weeks}
    anchor={anchor}
    today={today}
    role={role}
    days={days}
    assignments={assignments}
    onAdd={(d)=>openNewForDate(d)}
    showMonthLabels={mode==='month'}
    sortMode={sortMode}
    filter={filter}
    setSortMode={setSortMode}
    onDelete={removeAssignment}
    onEdit={openEditDialog}
  />
)}



{/* dialog */}
{dialogOpenForDay && (() => {
  const dayId = dialogOpenForDay.id;

  // ID operatori già assegnati quel giorno
  const excludeIds = new Set(
    (assignments[dayId] ?? [])
      .map(a => a?.staff?.id ?? '')
      .filter(id => id !== '')
  );

  // Operatori disponibili per quel giorno
  const availableStaffForDay = (staff ?? []).filter(s => !excludeIds.has(s.id));

  return (
   <NewAssignmentDialog
  dayId={dayId}
  iso={dialogOpenForDay.iso}
  staffList={availableStaffForDay}
  actList={activities}
  terrList={territories}
  onClose={() => setDialogOpenForDay(null)}
  onCreated={(row: Assignment, close = true) => {   // <-- usa il flag
    setAssignments(prev => {
      const arr = prev[dayId] ? [...prev[dayId]] : [];
      const i = arr.findIndex(x => x.id === row.id);
      if (i >= 0) arr[i] = row; else arr.push(row);
      const seen = new Set<string>();
     const dedup = arr.filter((a) => {
  const fresh = !seen.has(a.id);
  if (fresh) seen.add(a.id);
  return fresh;
});
dedup.sort((a, b) =>
  (a.staff?.display_name ?? '').localeCompare(
    b.staff?.display_name ?? '',
    'it',
    { sensitivity: 'base' }
  )
);

      return { ...prev, [dayId]: dedup };
    });
    if (close) setDialogOpenForDay(null);            // <-- chiudi solo se close=true
  }}
/>

  );
})()}



{/* >>> PUNTO C: modale Modifica <<< */}
{editAssignment && (() => {
  const dayId = editAssignment.day_id;

  const excludeIds = new Set(
    (assignments[dayId] ?? [])
      .map(a => a?.staff?.id ?? '')
      .filter(id => id !== '' && id !== (editAssignment.staff?.id ?? ''))
  );
  const availableStaffForEdit = (staff ?? []).filter(
    s => s.id === (editAssignment.staff?.id ?? '') || !excludeIds.has(s.id)
  );

  return (
    <EditAssignmentDialog
      assignment={editAssignment}
      staffList={availableStaffForEdit}
      actList={activities}
      terrList={territories}
      onClose={() => setEditAssignment(null)}
      onSaved={(updated, close = true) => {
        setAssignments(prev => {
          const arr = [...(prev[updated.day_id] ?? [])];
          const i = arr.findIndex(x => x.id === updated.id);
          if (i >= 0) arr[i] = updated;
          return { ...prev, [updated.day_id]: arr };
        });
        if (close) setEditAssignment(null);
      }}
      onDeleted={(a) => {
        setEditAssignment(null);
        removeAssignment(a);     // usa già la tua RPC + refresh
      }}
    />
  );
})()}

{/* NUOVO DIALOG: Inserisci Reperibile */}
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

</div>
);
}

// ---- Components ----
function SegBtn({active, onClick, children}:{active:boolean; onClick:()=>void; children:React.ReactNode}) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-sm ${active?'bg-gray-900 text-white':'hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}
// Colori: festività = rosso, weekend = arancione. Festività ha priorità sul weekend.
// Usa helper già importati: isItalyHoliday, isWeekend
// Colori: festività > weekend > default
const dayBgClass = (d: Date) => {
  if (isItalyHoliday(d)) return 'bg-[var(--hol-bg)]';
  if (isWeekend(d))      return 'bg-[var(--we-bg)]';
  return 'bg-[var(--card-bg)]';
};


/** DayCell: definito PRIMA di WeeksGrid */
function DayCell(props:{
  d: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  role: Role;
  dayMap: Record<string, DayRow>;
  assignments: Record<string, Assignment[]>;
  onAdd:(d:Date)=>void;
  showMonthLabel: boolean;
  sortMode: SortMode;
  filter: string;
  setSortMode: (m: SortMode)=>void;
  onDelete:(a:Assignment)=>void;
  onEdit:(a:Assignment)=>void;
}) {
  const { d, isToday, isCurrentMonth: _isCurrentMonth, role, dayMap, assignments, onAdd, showMonthLabel, sortMode, filter, setSortMode, onDelete, onEdit } = props;

  const iso = fmtDay(d);
  const dayRow = dayMap[iso];
  const list = dayRow ? (assignments[dayRow.id] ?? []) : [];

return (
  <div className={`rounded-2xl border shadow-sm p-2 ${dayBgClass(d)} border-[--card-bd] hover:ring-1 hover:ring-black/10`}>
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold flex items-center gap-2">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? 'ring-2 ring-offset-2 ring-[--today-ring]' : ''}`}>

          {d.getDate()}
        </span>
        {showMonthLabel && (
          <span>{d.toLocaleDateString('it-IT', { month: 'short' })}</span>
        )}
        {sortMode !== 'AZ' && (

          <button
            onClick={() => setSortMode('AZ')}
            className="text-[10px] px-2 py-0.5 rounded-full border bg-white hover:bg-gray-50"
            title="Ordina A → Z"
          >
            A→Z
          </button>
        )}
      </div>
<button
  onClick={() => onAdd(d)}
  className="text-xs px-2 py-1 rounded-lg border bg-white text-gray-900 hover:bg-gray-50"
>
  Nuovo
</button>

    </div>

    <div className="mt-2 space-y-2 overflow-y-auto" style={{ minHeight: 360, maxHeight: 900 }}>
      <AssignmentListByIds
        items={list}
        sortMode={sortMode}
        filter={filter}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    </div>
  </div>
);
}


function WeeksGrid(props:{
  weeks: Date[][];
  anchor: Date;
  today: Date;
  role: Role;
  days: DayRow[];
  assignments: Record<string, Assignment[]>;
  onAdd:(d:Date)=>void;
  showMonthLabels:boolean;
  sortMode: SortMode;
  filter: string;
  setSortMode: (m: SortMode)=>void;
  onDelete:(a:Assignment)=>void;
  onEdit:(a:Assignment)=>void;
}) {
  const { weeks, anchor, today, role, days, assignments, onAdd, showMonthLabels, sortMode, filter, setSortMode, onDelete, onEdit } = props;
  const dayMap = useMemo(()=>indexDays(days),[days]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-7 text-xs font-medium text-gray-600 px-1">
        {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((h)=>(
          <div key={h} className="px-2">{h}</div>
        ))}
      </div>

      {weeks.map((w,i)=>(
        <div key={i} className="grid grid-cols-7 gap-3">
          {w.map((d: Date) => (
            <DayCell
              key={fmtDay(d)}
              d={d}
              isToday={eqDate(d,today)}
              isCurrentMonth={d.getMonth()===anchor.getMonth()}
              role={role}
              dayMap={dayMap}
              assignments={assignments}
              onAdd={onAdd}
              showMonthLabel={showMonthLabels && d.getDate()===1}
              sortMode={sortMode}
              filter={filter}
              setSortMode={setSortMode}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      ))}
    </div>
  );
}


function AssignmentListByIds({
  items,
  sortMode,
  filter,
  onDelete,
  onEdit, // aggiunto
}: {
  items: Assignment[];
  sortMode: SortMode;
  filter: string;
  onDelete: (a: Assignment) => void;
  onEdit: (a: Assignment) => void; // aggiunto
}) {
  const visible = filterAssignments(items, filter);
  if (!visible.length) return <div className="text-xs opacity-50">—</div>;
  const sorted = sortAssignments(visible, sortMode);
  return (
    <div className="flex flex-col gap-1">
      {sorted.map((a: Assignment) => (
  <OperatorCard
    key={a.id}
    a={a}
    onDelete={() => onDelete(a)}
    onEdit={(x) => onEdit(x)}
  />
))}

    </div>
  );
}


function AssignmentList({
  dayMap,
  d,
  assignments,
  compact,
  sortMode,
  filter,
  onDelete,
  onEdit, // aggiunto
}: {
  dayMap: Record<string, DayRow>;
  d: Date;
  assignments: Record<string, Assignment[]>;
  compact: boolean; // eslint-disable-line @typescript-eslint/no-unused-vars
  sortMode: SortMode;
  filter: string;
  onDelete: (a: Assignment) => void;
  onEdit: (a: Assignment) => void; // aggiunto
}) {
  const iso = fmtDay(d);
  const dayRow = dayMap[iso];
  const items = dayRow ? (assignments[dayRow.id] ?? []) : [];
  const visible = filterAssignments(items, filter);
  if (!visible.length) return <div className="text-xs opacity-50">—</div>;
  const sorted = sortAssignments(visible, sortMode);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((a: Assignment) => (
  <OperatorCard
    key={a.id}
    a={a}
    onDelete={() => onDelete(a)}
    onEdit={(x) => onEdit(x)}
  />
))}

    </div>
  );
}

// ---- utils ----
function indexDays(rows: DayRow[]) {
  const m: Record<string, DayRow> = {};
  rows?.forEach(r => { m[r.day] = r; });
  return m;
}
function capitalize(s:string){ return s.charAt(0).toUpperCase()+s.slice(1); }
function fmtDay(d: Date){ return d.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0,10); }
function eqDate(a: Date, b: Date) { return fmtDay(a) === fmtDay(b); }

function sortAssignments(items: Assignment[], mode: SortMode): Assignment[] {
  const name = (a: Assignment) => a.staff?.display_name ?? '';
  const act  = (a: Assignment) => a.activity?.name ?? '';
  const terr = (a: Assignment) => a.territory?.name ?? '';
  const cmp  = (a:string,b:string) => a.localeCompare(b,'it',{sensitivity:'base'});
  const arr = [...items];
  switch (mode) {
    case 'REPERIBILE':
      return arr.sort((a,b) => (Number(b.reperibile)-Number(a.reperibile)) || cmp(name(a), name(b)));
    case 'ATTIVITA':
      return arr.sort((a,b) => (cmp(a.activity ? act(a) : 'zzzz', b.activity ? act(b) : 'zzzz')) || cmp(name(a), name(b)));
    case 'TERRITORIO':
    case 'PER_TERRITORIO':
      return arr.sort((a,b) => (cmp(a.territory ? terr(a) : 'zzzz', b.territory ? terr(b) : 'zzzz')) || cmp(name(a), name(b)));
    case 'SENZA_ATTIVITA':
      return arr.sort((a,b) => ((a.activity?1:0)-(b.activity?1:0)) || cmp(name(a), name(b)));
    case 'AZ':
    default:
      return arr.sort((a,b) => cmp(name(a), name(b)));
  }
}
function filterAssignments(items: Assignment[], filter: string): Assignment[] {
  if (!filter || filter === 'NONE') return items;
  if (filter === 'REPERIBILE') return items.filter(a => !!a.reperibile);
  if (filter.startsWith('STAFF:')) { const id = filter.slice(6); return items.filter(a => a.staff?.id === id); }
  if (filter.startsWith('ACT:'))   { const id = filter.slice(4); return items.filter(a => a.activity?.id === id); }
  if (filter.startsWith('TERR:'))  { const id = filter.slice(5); return items.filter(a => a.territory?.id === id); }
  return items;
}
