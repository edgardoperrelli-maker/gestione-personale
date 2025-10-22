'use client';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Guest = { id: string; name: string; territory: string };
type HotelBooking = {
  id: string;
  date: string; // YYYY-MM-DD
  hotelName: string;
  roomType: string;
  roomPrice: number;
  guests: Guest[];
  territory: string;
  notes?: string;
  dinner?: string;
  dinnerPrice?: number;
};

type ViewMode = 'month' | 'twoWeeks' | 'week';

function yyyyMmDd(d: Date) { return d.toISOString().slice(0, 10); }
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeekMonday(d: Date) { const x = startOfDay(d); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; return addDays(x, diff); }
function endOfWeekSunday(d: Date) { return addDays(startOfWeekMonday(d), 6); }
function daysArray(from: Date, to: Date) { const res: Date[] = []; let cur = startOfDay(from); const end = startOfDay(to); while (cur <= end) { res.push(cur); cur = addDays(cur, 1);} return res; }
function chunk<T>(arr: T[], size: number) { const out: T[][] = []; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }

// Mock dati UI
  const MOCK_GUESTS: Guest[] = [
  { id: '80b25f40-35a8-429e-b21c-0eb07c71683e', name: 'ADRIANO LIBERATORI', territory: '' },
  { id: '824a4397-1d3d-4a74-932a-98be67194be3', name: 'ALESSANDRO DE SANTIS', territory: '' },
  { id: '35f71f5b-a1e6-4de4-8f93-94bd5cd55155', name: 'ALESSIO MACCHIA', territory: '' },
  { id: '3d24d108-8396-43b4-9d07-7c7de022fcbb', name: 'DANIEL TREGU', territory: '' },
  { id: '15345c35-48b4-4374-aeea-2ba9d2c0576f', name: 'CRISTIANO DIONISI', territory: '' },
  { id: 'b2330af0-0da9-41f2-9caa-6c7099f8a302', name: 'FEDERICO PICCININI', territory: '' },
  { id: '87b22bd2-3fa9-4ee2-a738-33457063fcf2', name: 'LUCA FERRARA', territory: '' },
  { id: '133f7437-3411-43e2-9f98-7e392c2c396c', name: 'LUIGI PASTORELLI', territory: '' },
  { id: '1858c332-a60b-47ff-89df-f280f98b1c4c', name: 'MASSIMILIANO PASSACANTILLI', territory: '' },
  { id: '387eca6d-1932-4e9a-9dca-781ea12de2c0', name: 'MATTIA PRATESI', territory: '' },
  { id: '95b59ec2-e364-4e78-a045-b3ca460cd02f', name: 'SIMONE CIARALLO', territory: '' },
  { id: '0eddc815-de7c-4c1c-a78c-ce7f387c00df', name: 'VITTORIO GIOSI', territory: '' },
];
const STORAGE_KEY = 'vbA_hotel_bookings';

const MOCK_BOOKINGS: HotelBooking[] = [
  { id: 'b1', date: yyyyMmDd(addDays(new Date(), 1)), hotelName: 'Hotel Duomo', roomType: 'Doppia', roomPrice: 145, guests: [MOCK_GUESTS[0], MOCK_GUESTS[1]], territory: 'FIRENZE', notes: 'Late check-in', dinner: 'Standard', dinnerPrice: 25 },
  { id: 'b2', date: yyyyMmDd(addDays(new Date(), 2)), hotelName: 'Grand Hotel Arno', roomType: 'Suite', roomPrice: 260, guests: [MOCK_GUESTS[2]], territory: 'PADOVA', notes: '', dinner: 'Vegetariana', dinnerPrice: 22 },
];

// Regole territorio locali, allineate alla dashboard
const TERRITORY_UI: Record<string, { pill: string; card: string }> = {
  'FIRENZE':       { pill: 'bg-orange-50 text-orange-800 border-orange-200',  card: 'bg-orange-50 border-orange-200' },
    'PADOVA':        { pill: 'bg-violet-50 text-violet-800 border-violet-200',  card: 'bg-violet-50 border-violet-200' },
  'PERUGIA':       { pill: 'bg-rose-50 text-rose-800 border-rose-200',        card: 'bg-rose-50 border-rose-200' },
  
  'NAPOLI':        { pill: 'bg-blue-50 text-blue-800 border-blue-200',           card: 'bg-blue-50 border-blue-200' },    

  // aggiungi qui eventuali altri territori presenti in dashboard
};
const TERRITORIES = Object.keys(TERRITORY_UI);

function territoryPillClasses(t: string) {
  const key = (t || '').toUpperCase();
  return TERRITORY_UI[key]?.pill ?? 'bg-neutral-50 text-neutral-700 border-neutral-200';
}
function territoryCardClasses(t: string) {
  const key = (t || '').toUpperCase();
  return TERRITORY_UI[key]?.card ?? 'bg-white border-neutral-200';
}

function Modal({ open, title, onClose, children }:{
  open: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white shadow-lg">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="text-sm font-semibold">{title}</div>
            <button className="text-xs px-2 py-1 rounded-lg border" onClick={onClose}>Chiudi</button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function BookingForm({
  value, onChange, guestsAll, territories,
}:{
  value: HotelBooking; onChange: (next: HotelBooking) => void; guestsAll: Guest[]; territories: string[];
}) {
const guestsFiltered = guestsAll; // tutti gli operatori, indipendenti dal territorio


  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          <div className="mb-1">Data</div>
          <input type="date" className="w-full border rounded-lg px-2 py-1 text-sm"
            value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
        </label>
        <label className="text-xs">
          <div className="mb-1">Territorio</div>
          <select
            className="w-full border rounded-lg px-2 py-1 text-sm"
            value={(value.territory || '').toUpperCase()}
onChange={(e) => onChange({ ...value, territory: e.target.value })}

          >
            <option value="" disabled>Seleziona territorio</option>
            {territories.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          <div className="mb-1">Hotel</div>
          <input className="w-full border rounded-lg px-2 py-1 text-sm"
            value={value.hotelName} onChange={(e) => onChange({ ...value, hotelName: e.target.value })}/>
        </label>
        <label className="text-xs">
          <div className="mb-1">Tipologia camera</div>
          <input className="w-full border rounded-lg px-2 py-1 text-sm"
            value={value.roomType} onChange={(e) => onChange({ ...value, roomType: e.target.value })}/>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs col-span-1">
          <div className="mb-1">Prezzo camera</div>
          <input type="number" className="w-full border rounded-lg px-2 py-1 text-sm"
            value={value.roomPrice ?? 0} onChange={(e) => onChange({ ...value, roomPrice: Number(e.target.value) })}/>
        </label>
        <label className="text-xs col-span-1">
          <div className="mb-1">Cena</div>
          <input className="w-full border rounded-lg px-2 py-1 text-sm"
            value={value.dinner ?? ''} onChange={(e) => onChange({ ...value, dinner: e.target.value })}/>
        </label>
        <label className="text-xs col-span-1">
          <div className="mb-1">Prezzo cena</div>
          <input type="number" className="w-full border rounded-lg px-2 py-1 text-sm"
            value={value.dinnerPrice ?? 0} onChange={(e) => onChange({ ...value, dinnerPrice: Number(e.target.value) })}/>
        </label>
      </div>

      <label className="text-xs block">
        <div className="mb-1">Note</div>
        <textarea className="w-full border rounded-lg px-2 py-1 text-sm" rows={3}
          value={value.notes ?? ''} onChange={(e) => onChange({ ...value, notes: e.target.value })}/>
      </label>

<label className="text-xs block">
  <div className="mb-1">Ospiti</div>
  <select
    multiple
    className="w-full border rounded-lg px-2 py-1 text-sm h-28"
    value={value.guests.map(g => g.id)}
    onChange={(e) => {
      const selectedIds = Array.from(e.currentTarget.selectedOptions).map(o => o.value);
      const selected = guestsFiltered.filter(g => selectedIds.includes(g.id));
      onChange({ ...value, guests: selected });
    }}
  >
    {guestsFiltered.map(g => (
      <option key={g.id} value={g.id}>
        {g.name}
      </option>
    ))}
  </select>
  <div className="mt-1 text-[11px] text-neutral-500">
    Seleziona uno o più operatori
  </div>
</label>


    </form>
  );
}

export default function Page() {
  const [mode, setMode] = useState<ViewMode>('month');
  const [pivot, setPivot] = useState<Date>(startOfDay(new Date()));
  const [newModal, setNewModal] = useState<{ open: boolean; date: string | null }>({ open: false, date: null });
  const [editModal, setEditModal] = useState<{ open: boolean; booking: HotelBooking | null }>({ open: false, booking: null });
// DOPO
const [bookings, setBookings] = useState<HotelBooking[]>([]);
const [loaded, setLoaded] = useState(false);

useEffect(() => {
  (async () => {
    const { data, error } = await supabase
      .from('hotel_bookings')
      .select('*')
      .gte('date', yyyyMmDd(addDays(startOfWeekMonday(pivot), -35)))   // margine
      .lte('date', yyyyMmDd(addDays(endOfWeekSunday(pivot), 35)));
    if (!error && data) {
      setBookings(
        data.map((r: any) => ({
          id: r.id,
          date: r.date,
          hotelName: r.hotel_name,
          roomType: r.room_type,
          roomPrice: Number(r.room_price),
          guests: r.guests ?? [],
          territory: r.territory,
          notes: r.notes ?? '',
          dinnerPrice: r.dinner_price != null ? Number(r.dinner_price) : undefined,
        }))
      );
    }
    setLoaded(true);
  })();
}, [pivot]);


useEffect(() => {
  const channel = supabase
    .channel('hotel_bookings_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_bookings' }, async () => {
      // ricarica finestra corrente
      const { data } = await supabase
        .from('hotel_bookings')
        .select('*')
        .gte('date', yyyyMmDd(addDays(startOfWeekMonday(pivot), -35)))
        .lte('date', yyyyMmDd(addDays(endOfWeekSunday(pivot), 35)));
      if (data) {
        setBookings(data.map((r: any) => ({
          id: r.id, date: r.date, hotelName: r.hotel_name, roomType: r.room_type,
          roomPrice: Number(r.room_price), guests: r.guests ?? [], territory: r.territory,
          notes: r.notes ?? '', dinnerPrice: r.dinner_price != null ? Number(r.dinner_price) : undefined,
        })));
      }
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [pivot]);


  const [draft, setDraft] = useState<HotelBooking | null>(null);

async function deleteBooking(id: string) {
  if (!confirm('Eliminare questa prenotazione?')) return;
  const prev = bookings;
  setBookings(prev.filter(b => b.id !== id)); // ottimistica
  const { error } = await supabase.from('hotel_bookings').delete().eq('id', id);
  if (error) setBookings(prev); // rollback in caso di errore
}


  useEffect(() => {
    const handler = (e: any) => openEdit(e.detail as HotelBooking);
    window.addEventListener('hotel-edit', handler as any);
    return () => window.removeEventListener('hotel-edit', handler as any);
  }, []);

  function openNew(dateStr: string) {
    const empty: HotelBooking = { id: `tmp-${Date.now()}`, date: dateStr, hotelName: '', roomType: '', roomPrice: 0, guests: [], territory: '', notes: '', dinner: '', dinnerPrice: 0 };
    setDraft(empty); setNewModal({ open: true, date: dateStr });
  }
  function openEdit(b: HotelBooking) { setDraft({ ...b }); setEditModal({ open: true, booking: b }); }
  function closeModals() { setNewModal({ open: false, date: null }); setEditModal({ open: false, booking: null }); setDraft(null); }
async function saveDraft() {
  if (!draft) return;

  const payload = {
    date: draft.date,
    hotel_name: draft.hotelName,
    room_type: draft.roomType,
    room_price: draft.roomPrice,
    guests: draft.guests,
    territory: draft.territory,
    notes: draft.notes ?? null,
    dinner_price: draft.dinnerPrice ?? null,
    updated_at: new Date().toISOString(),
    
  };

  if (draft.id.startsWith('tmp-')) {
    const { data, error } = await supabase
      .from('hotel_bookings')
      .insert(payload)
      .select()
      .single();
    if (!error && data) {
      setBookings(prev => [...prev, {
        ...draft, id: data.id,
      }]);
    }
  } else {
    const { error } = await supabase
      .from('hotel_bookings')
      .update(payload)
      .eq('id', draft.id);
    if (!error) {
      setBookings(prev => {
        const i = prev.findIndex(x => x.id === draft.id);
        const next = [...prev]; next[i] = draft; return next;
      });
    }
  }
  closeModals();
}

  const range = useMemo(() => {
    const monthStart = new Date(pivot.getFullYear(), pivot.getMonth(), 1);
    const monthEnd = new Date(pivot.getFullYear(), pivot.getMonth() + 1, 0);
    const twoWeeksEnd = addDays(pivot, 13);
    const weekStart = startOfWeekMonday(pivot);
    const weekEnd = endOfWeekSunday(pivot);
    if (mode === 'month') return { from: startOfWeekMonday(monthStart), to: endOfWeekSunday(monthEnd) };
    if (mode === 'twoWeeks') return { from: startOfWeekMonday(pivot), to: endOfWeekSunday(twoWeeksEnd) };
    return { from: weekStart, to: weekEnd };
  }, [mode, pivot]);

  const days = useMemo(() => daysArray(range.from, range.to), [range]);
  const weeks = useMemo(() => chunk(days, 7), [days]);
  const today = yyyyMmDd(new Date());

  const bookingsByDay = useMemo(() => {
    const map: Record<string, HotelBooking[]> = {};
    for (const b of bookings) { if (!map[b.date]) map[b.date] = []; map[b.date].push(b); }
    return map;
  }, [bookings]);

  function fmtDay(d: Date) { return d.getDate(); }
  function fmtKey(d: Date) { return yyyyMmDd(d); }
  function monthLabel(d: Date) { return d.toLocaleString('it-IT', { month: 'long', year: 'numeric' }); }
  function weekdayName(i: number) { return ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'][i]; }
if (!loaded) {
  return <div className="p-4 text-sm text-neutral-500">Caricamento…</div>;
}
function shiftPrev() {
  if (mode === 'month') setPivot(new Date(pivot.getFullYear(), pivot.getMonth() - 1, 1));
  else if (mode === 'twoWeeks') setPivot(addDays(pivot, -14));
  else setPivot(addDays(pivot, -7));
}
function shiftNext() {
  if (mode === 'month') setPivot(new Date(pivot.getFullYear(), pivot.getMonth() + 1, 1));
  else if (mode === 'twoWeeks') setPivot(addDays(pivot, 14));
  else setPivot(addDays(pivot, 7));
}
function fmtIt(d: Date) { return d.toLocaleDateString('it-IT'); }
const weekStart = startOfWeekMonday(pivot);
const weekEnd = addDays(weekStart, 6);
const rangeLabel = `${fmtIt(weekStart)} — ${fmtIt(weekEnd)}`;


  return (
    <div className="p-4 space-y-4">
      {/* Toolbar */}
<div className="flex items-center justify-between gap-2">
  {/* Sinistra: ← range → + pulsanti vista */}
  <div className="flex items-center gap-2">
    <button
      className="px-3 py-2 rounded-xl shadow border text-sm"
      onClick={() => setPivot(addDays(pivot, -7))}
      aria-label="Settimana precedente"
    >
      ←
    </button>

    <div className="text-lg font-semibold">{rangeLabel}</div>

    <button
      className="px-3 py-2 rounded-xl shadow border text-sm"
      onClick={() => setPivot(addDays(pivot, 7))}
      aria-label="Settimana successiva"
    >
      →
    </button>

    {/* Pulsanti subito dopo la freccia destra */}
    <div className="ml-2 flex items-center gap-1">
      <button
        onClick={() => setMode('week')}
        className={`px-3 py-2 rounded-xl shadow border text-sm ${mode === 'week' ? 'bg-black text-white border-black' : ''}`}
      >
        Settimana
      </button>
      <button
        onClick={() => setMode('twoWeeks')}
        className={`px-3 py-2 rounded-xl shadow border text-sm ${mode === 'twoWeeks' ? 'bg-black text-white border-black' : ''}`}
      >
        2 settimane
      </button>
      <button
        onClick={() => setMode('month')}
        className={`px-3 py-2 rounded-xl shadow border text-sm ${mode === 'month' ? 'bg-black text-white border-black' : ''}`}
      >
        Mese
      </button>
      <button
        className="px-3 py-2 rounded-xl shadow border text-sm"
        onClick={() => setPivot(startOfDay(new Date()))}
      >
        Oggi
      </button>
    </div>
  </div>

  {/* Destra: Hub */}
  <Link href="/hub" className="px-3 py-2 rounded-xl shadow border text-sm">Hub</Link>
</div>



      {/* Header giorni */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="text-xs font-medium px-2 py-1">{weekdayName(i)}</div>
        ))}
      </div>

      {/* Griglia calendario */}
      <div className="grid grid-cols-7 gap-2">
        {weeks.map((w, wi) => (
          <div key={wi} className="contents">
            {w.map((d, di) => {
              const key = fmtKey(d);
              const dayBookings = bookingsByDay[key] ?? [];
              const isToday = key === today;
              const inMonth = d.getMonth() === pivot.getMonth();

              return (
                <div
                  key={di}
                  className={`border rounded-2xl p-2 min-h-[220px] flex flex-col gap-2 bg-white ${inMonth ? '' : 'opacity-40'} ${isToday ? 'ring-2 ring-black' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{fmtDay(d)}</div>
                    <button className="text-xs px-2 py-1 rounded-lg border shadow" onClick={() => openNew(key)} aria-label={`Nuova prenotazione per ${key}`}>
                      Nuovo
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto space-y-2">
                    {dayBookings.map((b) => (
  <HotelCard key={b.id} booking={b} onDelete={() => deleteBooking(b.id)} />

))}

                    {dayBookings.length === 0 && (<div className="text-xs text-neutral-500">Nessuna prenotazione</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Modali */}
      <Modal open={newModal.open && !!draft} title="Nuova prenotazione hotel" onClose={closeModals}>
        {draft && (
          <>
            <BookingForm value={draft} onChange={setDraft} guestsAll={MOCK_GUESTS} territories={TERRITORIES} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border" onClick={closeModals}>Annulla</button>
              <button className="px-3 py-2 rounded-lg border shadow" onClick={saveDraft}>Salva</button>
              
            </div>
          </>
        )}
      </Modal>

      <Modal open={editModal.open && !!draft} title="Modifica prenotazione hotel" onClose={closeModals}>
        {draft && (
          <>
            <BookingForm value={draft} onChange={setDraft} guestsAll={MOCK_GUESTS} territories={TERRITORIES} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-2 rounded-lg border" onClick={closeModals}>Annulla</button>
              <button className="px-3 py-2 rounded-lg border shadow" onClick={saveDraft}>Salva</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function Euro({ value }: { value: number | undefined }) {
  if (value == null) return <span>—</span>;
  return <span>€ {value.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</span>;
}

function HotelCard({ booking, onDelete }: { booking: HotelBooking; onDelete: () => void }) {
  return (
    <div className={`border rounded-xl p-2 shadow-sm ${territoryCardClasses(booking.territory)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">{booking.hotelName}</div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${territoryPillClasses(booking.territory)}`}
            title={booking.territory}
          >
            {booking.territory}
          </span>
        </div>
        <div className="flex items-center gap-2">
  
</div>

      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <div className="font-medium">Camera</div>
        <div>{booking.roomType}</div>

        <div className="font-medium">Prezzo camera</div>
        <div><Euro value={booking.roomPrice} /></div>

        
<div className="font-medium">Prezzo cena totale</div>
<div>{booking.dinnerPrice ? <Euro value={booking.dinnerPrice * (booking.guests?.length ?? 0)} /> : '—'}</div>


        <div className="font-medium">Note</div>
        <div className="truncate" title={booking.notes || ''}>{booking.notes || '—'}</div>
      </div>

      <div className="mt-2">
        <div className="text-xs font-medium mb-1">Ospiti</div>
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
  {booking.guests.map((g) => (
    <span
      key={g.id}
      className="whitespace-nowrap text-[10px] px-2 py-1 rounded-full border"
      title={g.name}
    >
      {g.name}
    </span>
  ))}
</div>
<div className="mt-2 flex gap-2">
  <button
    className="text-xs px-2 py-1 rounded-lg border shadow"
    onClick={() => window.dispatchEvent(new CustomEvent('hotel-edit', { detail: booking }))}
    aria-label={`Modifica prenotazione ${booking.id}`}
  >
    Modifica
  </button>
  <button
    className="text-xs px-2 py-1 rounded-lg border shadow text-red-700"
    onClick={onDelete}
    aria-label={`Elimina prenotazione ${booking.id}`}
  >
    Elimina
  </button>
</div>

      </div>
    </div>
  );
}
