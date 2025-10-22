'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';

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
  const [bookings, setBookings] = useState<HotelBooking[]>([...MOCK_BOOKINGS]);
  const [draft, setDraft] = useState<HotelBooking | null>(null);

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
  function saveDraft() {
    if (!draft) return;
    setBookings((prev) => {
      const idx = prev.findIndex((x) => x.id === draft.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = draft; return next; }
      return [...prev, draft];
    });
    function deleteBooking(id: string) {
  if (!confirm('Eliminare questa prenotazione?')) return;
  setBookings((prev) => prev.filter((b) => b.id !== id));
  const i = MOCK_BOOKINGS.findIndex((x) => x.id === id);
  if (i >= 0) MOCK_BOOKINGS.splice(i, 1);
}

    const i = MOCK_BOOKINGS.findIndex((x) => x.id === draft.id);
    if (i >= 0) MOCK_BOOKINGS[i] = draft; else MOCK_BOOKINGS.push(draft);
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

  return (
    <div className="p-4 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/hub" className="px-3 py-2 rounded-xl shadow border text-sm">Hub</Link>
          <div className="text-lg font-semibold">Calendario hotel · {monthLabel(pivot)}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-xl shadow border text-sm" onClick={() => setPivot(addDays(pivot, -1))}>◀</button>
          <button className="px-3 py-2 rounded-xl shadow border text-sm" onClick={() => setPivot(startOfDay(new Date()))}>Oggi</button>
          <button className="px-3 py-2 rounded-xl shadow border text-sm" onClick={() => setPivot(addDays(pivot, +1))}>▶</button>
          <select className="px-3 py-2 rounded-xl shadow border text-sm" value={mode} onChange={(e) => setMode(e.target.value as ViewMode)}>
            <option value="month">Mese</option>
            <option value="twoWeeks">2 settimane</option>
            <option value="week">Settimana</option>
          </select>
        </div>
      </div>

      {/* Header giorni */}
      <div className="grid grid-cols-7 gap-2 sticky top-0 bg-white z-10">
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

              function deleteBooking(id: string): void {
                throw new Error('Function not implemented.');
              }

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
  <button
    className="text-xs px-2 py-1 rounded-lg border shadow"
    onClick={() => window.dispatchEvent(new CustomEvent('hotel-edit', { detail: booking }))}
    aria-label={`Modifica prenotazione ${booking.id}`}
  >
    Modifica
  </button>
  <button
    className="text-xs px-2 py-1 rounded-lg border shadow text-red-700"
    onClick={() => onDelete()}
    aria-label={`Elimina prenotazione ${booking.id}`}
  >
    Elimina
  </button>
</div>

      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <div className="font-medium">Camera</div>
        <div>{booking.roomType}</div>

        <div className="font-medium">Prezzo camera</div>
        <div><Euro value={booking.roomPrice} /></div>

        <div className="font-medium">Cena</div>
        <div>{booking.dinner ?? '—'}</div>

        <div className="font-medium">Prezzo cena</div>
        <div><Euro value={booking.dinnerPrice} /></div>

        <div className="font-medium">Note</div>
        <div className="truncate" title={booking.notes || ''}>{booking.notes || '—'}</div>
      </div>

      <div className="mt-2">
        <div className="text-xs font-medium mb-1">Ospiti</div>
        <div className="flex flex-wrap gap-1">
          {booking.guests.map((g) => (
            <span key={g.id} className="text-[10px] px-2 py-1 rounded-full border">{g.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
