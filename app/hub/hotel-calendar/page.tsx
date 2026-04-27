'use client';

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SendRequestModal from './SendRequestModal';
import type { Hotel, Territory } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Guest = { id: string; name: string; territory: string };
type HotelBooking = {
  id: string;
  date: string;
  hotel_id?: string | null;
  hotelName: string;
  roomType: string;
  roomPrice: number;
  guests: Guest[];
  territory: string;
  territory_id?: string | null;
  notes?: string;
  dinnerPrice?: number;
};
type ViewMode = 'month' | 'twoWeeks' | 'week';

type RawHotelBooking = {
  id: string;
  date: string;
  hotel_id?: string | null;
  hotel_name?: string | null;
  room_type?: string | null;
  room_price?: number | string | null;
  guests?: unknown;
  territory?: string | null;
  territory_id?: string | null;
  notes?: string | null;
  dinner_price?: number | string | null;
};

type BootstrapResponse = {
  hotels?: Hotel[];
  territories?: Territory[];
  error?: string;
};

type PopulateResponse = {
  guests?: Guest[];
  error?: string;
};

type RoomOption = {
  id: string;
  room_type: string;
  price_per_night: number;
  dinner_price_per_person?: number | null;
  configured: boolean;
};

const TERRITORY_UI: Record<string, { pill: string; card: string }> = {
  FIRENZE: { pill: 'bg-orange-50 text-orange-800 border-orange-200', card: 'bg-orange-50 border-orange-200' },
  PADOVA: { pill: 'bg-violet-50 text-violet-800 border-violet-200', card: 'bg-violet-50 border-violet-200' },
  PERUGIA: { pill: 'bg-rose-50 text-rose-800 border-rose-200', card: 'bg-rose-50 border-rose-200' },
  NAPOLI: { pill: 'bg-blue-50 text-blue-800 border-blue-200', card: 'bg-blue-50 border-blue-200' },
};

function yyyyMmDd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ymdToDateLocal(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeekMonday(date: Date) {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(result, diff);
}

function endOfWeekSunday(date: Date) {
  return addDays(startOfWeekMonday(date), 6);
}

function daysArray(from: Date, to: Date) {
  const result: Date[] = [];
  let current = startOfDay(from);
  const end = startOfDay(to);
  while (current <= end) {
    result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function territoryPillClasses(territory: string) {
  const key = (territory || '').toUpperCase();
  return TERRITORY_UI[key]?.pill ?? 'bg-neutral-50 text-neutral-700 border-neutral-200';
}

function territoryCardClasses(territory: string) {
  const key = (territory || '').toUpperCase();
  return TERRITORY_UI[key]?.card ?? 'bg-white border-neutral-200';
}

function normalizeGuests(value: unknown): Guest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { id?: unknown; name?: unknown; territory?: unknown };
    const id = String(candidate.id ?? '').trim();
    const name = String(candidate.name ?? '').trim();
    if (!id || !name) return [];
    return [{ id, name, territory: String(candidate.territory ?? '') }];
  });
}

function bookingFromRow(row: RawHotelBooking): HotelBooking {
  return {
    id: row.id,
    date: row.date,
    hotel_id: row.hotel_id ?? null,
    hotelName: row.hotel_name ?? '',
    roomType: row.room_type ?? '',
    roomPrice: Number(row.room_price ?? 0),
    guests: normalizeGuests(row.guests),
    territory: row.territory ?? '',
    territory_id: row.territory_id ?? null,
    notes: row.notes ?? '',
    dinnerPrice: row.dinner_price != null ? Number(row.dinner_price) : undefined,
  };
}

function money(value: number | undefined) {
  if (value == null) return '-';
  return `EUR ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeLookup(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it-IT');
}

function roomOptionsForHotel(hotel: Hotel | null): RoomOption[] {
  const configured = hotel?.room_prices ?? [];
  if (configured.length > 0) {
    return configured.map((room) => ({
      id: room.id,
      room_type: room.room_type,
      price_per_night: Number(room.price_per_night ?? 0),
      dinner_price_per_person: room.dinner_price_per_person != null ? Number(room.dinner_price_per_person) : null,
      configured: true,
    }));
  }

  return ['Singola', 'Doppia', 'Tripla', 'Quadrupla'].map((roomType) => ({
    id: `default-${roomType}`,
    room_type: roomType,
    price_per_night: 0,
    dinner_price_per_person: 0,
    configured: false,
  }));
}

function territoryNameById(territories: Territory[], territoryId: string | null | undefined) {
  if (!territoryId) return '';
  return territories.find((territory) => territory.id === territoryId)?.name ?? '';
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b p-3">
            <div className="text-sm font-semibold">{title}</div>
            <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={onClose}>Chiudi</button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function BookingForm({
  value,
  onChange,
  hotels,
  territories,
  rangeEnd,
  onRangeEndChange,
}: {
  value: HotelBooking;
  onChange: (next: HotelBooking) => void;
  hotels: Hotel[];
  territories: Territory[];
  rangeEnd: string | null;
  onRangeEndChange: (value: string) => void;
}) {
  const [eligibleGuests, setEligibleGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const selectedHotel = hotels.find((hotel) => hotel.id === value.hotel_id)
    ?? hotels.find((hotel) => normalizeLookup(hotel.name) === normalizeLookup(value.hotelName))
    ?? null;
  const autoTerritoryId = selectedHotel?.territory_id ?? value.territory_id ?? null;
  const autoTerritoryName = selectedHotel?.territory?.name
    ?? territoryNameById(territories, autoTerritoryId)
    ?? value.territory
    ?? '';
  const roomOptions = roomOptionsForHotel(selectedHotel);
  const selectedRoomId = roomOptions.find((room) => room.room_type === value.roomType)?.id ?? '';

  const loadCronoprogrammaGuests = async () => {
    if (!autoTerritoryId) {
      setEligibleGuests([]);
      return [];
    }
    const from = value.date;
    const to = rangeEnd ?? value.date;
    setLoadingGuests(true);
    try {
      const response = await fetch('/api/hotel-calendar/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          territoryId: autoTerritoryId,
          territoryName: autoTerritoryName,
        }),
      });
      const json = await response.json() as PopulateResponse;
      const guests = response.ok ? json.guests ?? [] : [];
      setEligibleGuests(guests);
      return guests;
    } finally {
      setLoadingGuests(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!autoTerritoryId) {
      setEligibleGuests([]);
      return;
    }
    setLoadingGuests(true);
    const from = value.date;
    const to = rangeEnd ?? value.date;
    fetch('/api/hotel-calendar/populate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        territoryId: autoTerritoryId,
        territoryName: autoTerritoryName,
      }),
    }).then(async (response) => {
      const json = await response.json() as PopulateResponse;
      if (!alive) return;
      setEligibleGuests(response.ok ? json.guests ?? [] : []);
    }).finally(() => {
      if (alive) setLoadingGuests(false);
    });
    return () => {
      alive = false;
    };
  }, [autoTerritoryId, autoTerritoryName, rangeEnd, value.date]);

  const populateFromCronoprogramma = async () => {
    const guests = await loadCronoprogrammaGuests();
    onChange({ ...value, guests });
  };

  return (
    <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          <div className="mb-1">Dal</div>
          <input
            type="date"
            className="w-full rounded-lg border px-2 py-1 text-sm"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
          />
        </label>
        <label className="text-xs">
          <div className="mb-1">Al</div>
          <input
            type="date"
            className="w-full rounded-lg border px-2 py-1 text-sm"
            value={rangeEnd ?? value.date}
            min={value.date}
            onChange={(event) => onRangeEndChange(event.target.value)}
          />
        </label>
      </div>

      <label className="block text-xs">
        <div className="mb-1">Hotel</div>
        <select
          className="w-full rounded-lg border px-2 py-1 text-sm"
          value={value.hotel_id ?? ''}
          onChange={(event) => {
            const hotel = hotels.find((item) => item.id === event.target.value) ?? null;
            onChange({
              ...value,
              hotel_id: hotel?.id ?? null,
              hotelName: hotel?.name ?? '',
              territory: (hotel?.territory?.name ?? territoryNameById(territories, hotel?.territory_id)).toUpperCase(),
              territory_id: hotel?.territory_id ?? null,
              roomType: '',
              roomPrice: 0,
              dinnerPrice: 0,
              guests: [],
            });
          }}
        >
          <option value="">Seleziona hotel</option>
          {hotels.filter((hotel) => hotel.active).map((hotel) => (
            <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-1 text-xs">Territorio</div>
        <div className="inline-flex rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary)]">
          {autoTerritoryName ? autoTerritoryName.toUpperCase() : 'Seleziona un hotel'}
        </div>
      </div>

      <label className="block text-xs">
        <div className="mb-1">Tipologia camera</div>
        <select
          className="w-full rounded-lg border px-2 py-1 text-sm"
          value={selectedRoomId}
          disabled={!selectedHotel}
          onChange={(event) => {
            const room = roomOptions.find((item) => item.id === event.target.value) ?? null;
            onChange({
              ...value,
              roomType: room?.room_type ?? '',
              roomPrice: room?.price_per_night ?? 0,
              dinnerPrice: room?.dinner_price_per_person != null ? Number(room.dinner_price_per_person) : 0,
            });
          }}
        >
          <option value="">Seleziona tipologia</option>
          {roomOptions.map((room) => (
            <option key={room.id} value={room.id}>
              {room.room_type} - {money(room.price_per_night)}/notte
              {room.dinner_price_per_person != null ? ` + cena ${money(Number(room.dinner_price_per_person))}/pers.` : ''}
            </option>
          ))}
        </select>
        {selectedHotel && roomOptions.every((room) => !room.configured) && (
          <div className="mt-1 text-[11px] text-amber-700">
            Prezzi non configurati per questo hotel: puoi selezionare una tipologia base a EUR 0,00 o impostare i prezzi in Impostazioni - Hotel.
          </div>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3 text-xs">
        <div>
          <div className="text-[var(--brand-text-muted)]">Prezzo camera</div>
          <div className="font-semibold">{money(value.roomPrice)}</div>
        </div>
        <div>
          <div className="text-[var(--brand-text-muted)]">Cena per persona</div>
          <div className="font-semibold">{money(value.dinnerPrice)}</div>
        </div>
      </div>

      <label className="block text-xs">
        <div className="mb-1">Note</div>
        <textarea
          className="w-full rounded-lg border px-2 py-1 text-sm"
          rows={3}
          value={value.notes ?? ''}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </label>

      {autoTerritoryId && (
        <button
          type="button"
          className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-xs font-semibold"
          onClick={() => void populateFromCronoprogramma()}
        >
          Aggiorna da cronoprogramma
        </button>
      )}

      <label className="block text-xs">
        <div className="mb-1">Ospiti</div>
        <select
          multiple
          className="h-28 w-full rounded-lg border px-2 py-1 text-sm"
          value={value.guests.map((guest) => guest.id)}
          onChange={(event) => {
            const selectedIds = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
            const selected = eligibleGuests.filter((guest) => selectedIds.includes(guest.id));
            onChange({ ...value, guests: selected });
          }}
        >
          {eligibleGuests.map((guest) => (
            <option key={guest.id} value={guest.id}>{guest.name}</option>
          ))}
        </select>
        <div className="mt-1 text-[11px] text-neutral-500">
          {loadingGuests
            ? 'Caricamento operatori dal cronoprogramma...'
            : 'Sono mostrati solo gli operatori assegnati nel cronoprogramma a questo territorio; i residenti sono esclusi.'}
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
  const [exportModal, setExportModal] = useState<{ open: boolean; from: string; to: string }>({
    open: false,
    from: yyyyMmDd(startOfWeekMonday(pivot)),
    to: yyyyMmDd(endOfWeekSunday(pivot)),
  });
  const [bookings, setBookings] = useState<HotelBooking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [draft, setDraft] = useState<HotelBooking | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);

  function goPrev() {
    if (mode === 'month') setPivot(new Date(pivot.getFullYear(), pivot.getMonth() - 1, 1));
    else setPivot(addDays(pivot, -7));
  }

  function goNext() {
    if (mode === 'month') setPivot(new Date(pivot.getFullYear(), pivot.getMonth() + 1, 1));
    else setPivot(addDays(pivot, 7));
  }

  const isMonth = mode === 'month';
  const fmtIt = (date: Date) => date.toLocaleDateString('it-IT');
  const weekStart = startOfWeekMonday(pivot);
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel = `${fmtIt(weekStart)} - ${fmtIt(weekEnd)}`;

  useEffect(() => {
    fetch('/api/hotel-calendar/bootstrap', { cache: 'no-store' }).then(async (response) => {
      const json = await response.json() as BootstrapResponse;
      if (!response.ok) return;
      setHotels(json.hotels ?? []);
      setTerritories(json.territories ?? []);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('hotel_bookings')
        .select('*')
        .gte('date', yyyyMmDd(addDays(startOfWeekMonday(pivot), -35)))
        .lte('date', yyyyMmDd(addDays(endOfWeekSunday(pivot), 35)));
      if (!error && data) setBookings((data as RawHotelBooking[]).map(bookingFromRow));
      setLoaded(true);
    })();
  }, [pivot]);

  useEffect(() => {
    const channel = supabase
      .channel('hotel_bookings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_bookings' }, async () => {
        const { data } = await supabase
          .from('hotel_bookings')
          .select('*')
          .gte('date', yyyyMmDd(addDays(startOfWeekMonday(pivot), -35)))
          .lte('date', yyyyMmDd(addDays(endOfWeekSunday(pivot), 35)));
        if (data) setBookings((data as RawHotelBooking[]).map(bookingFromRow));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pivot]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<HotelBooking>;
      openEdit(custom.detail);
    };
    window.addEventListener('hotel-edit', handler);
    return () => window.removeEventListener('hotel-edit', handler);
  }, []);

  async function deleteBooking(id: string) {
    if (!window.confirm('Eliminare questa prenotazione?')) return;
    const previous = bookings;
    setBookings(previous.filter((booking) => booking.id !== id));
    const { error } = await supabase.from('hotel_bookings').delete().eq('id', id);
    if (error) setBookings(previous);
  }

  function openNew(dateStr: string) {
    const empty: HotelBooking = {
      id: `tmp-${Date.now()}`,
      date: dateStr,
      hotel_id: null,
      hotelName: '',
      roomType: '',
      roomPrice: 0,
      guests: [],
      territory: '',
      territory_id: null,
      notes: '',
      dinnerPrice: 0,
    };
    setDraft(empty);
    setRangeEnd(dateStr);
    setNewModal({ open: true, date: dateStr });
  }

  function openEdit(booking: HotelBooking) {
    setDraft({ ...booking });
    setRangeEnd(booking.date);
    setEditModal({ open: true, booking });
  }

  function closeModals() {
    setNewModal({ open: false, date: null });
    setEditModal({ open: false, booking: null });
    setDraft(null);
    setRangeEnd(null);
  }

  function draftPayload(booking: HotelBooking, date: string) {
    return {
      date,
      hotel_id: booking.hotel_id ?? null,
      hotel_name: booking.hotelName,
      room_type: booking.roomType,
      room_price: booking.roomPrice,
      guests: booking.guests,
      territory: booking.territory,
      territory_id: booking.territory_id ?? null,
      notes: booking.notes ?? null,
      dinner_price: booking.dinnerPrice ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveDraft() {
    if (!draft) return;

    if (draft.id.startsWith('tmp-')) {
      const from = ymdToDateLocal(draft.date);
      const to = ymdToDateLocal(rangeEnd ?? draft.date);
      to.setHours(0, 0, 0, 0);

      const payloads = [];
      for (let date = new Date(from); date <= to; date = addDays(date, 1)) {
        payloads.push(draftPayload(draft, yyyyMmDd(date)));
      }

      const { data, error } = await supabase.from('hotel_bookings').insert(payloads).select();
      if (!error && data) {
        setBookings((prev) => [...prev, ...(data as RawHotelBooking[]).map(bookingFromRow)]);
      }
    } else {
      const { error } = await supabase
        .from('hotel_bookings')
        .update(draftPayload(draft, draft.date))
        .eq('id', draft.id);

      if (!error) {
        setBookings((prev) => prev.map((booking) => (booking.id === draft.id ? draft : booking)));
      }
    }

    closeModals();
  }

  async function exportXlsx() {
    const { from, to } = exportModal;
    if (!from || !to) return;

    const fromDate = ymdToDateLocal(from);
    const toDate = ymdToDateLocal(to);
    const rows = bookings
      .filter((booking) => {
        const date = ymdToDateLocal(booking.date);
        return date >= fromDate && date <= toDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((booking) => ({
        Data: booking.date,
        Hotel: booking.hotelName,
        Territorio: booking.territory,
        Camera: booking.roomType,
        'Prezzo camera': booking.roomPrice,
        'Prezzo cena totale': (booking.dinnerPrice ?? 0) * (booking.guests?.length ?? 0),
        Note: booking.notes ?? '',
        Ospiti: (booking.guests ?? []).map((guest) => guest.name).join(', '),
      }));

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prenotazioni');
    XLSX.writeFile(workbook, `prenotazioni_${from}_${to}.xlsx`);
    setExportModal((modal) => ({ ...modal, open: false }));
  }

  const range = useMemo(() => {
    const monthStart = new Date(pivot.getFullYear(), pivot.getMonth(), 1);
    const monthEnd = new Date(pivot.getFullYear(), pivot.getMonth() + 1, 0);
    const twoWeeksEnd = addDays(pivot, 13);
    const weekRangeStart = startOfWeekMonday(pivot);
    const weekRangeEnd = endOfWeekSunday(pivot);
    if (mode === 'month') return { from: startOfWeekMonday(monthStart), to: endOfWeekSunday(monthEnd) };
    if (mode === 'twoWeeks') return { from: startOfWeekMonday(pivot), to: endOfWeekSunday(twoWeeksEnd) };
    return { from: weekRangeStart, to: weekRangeEnd };
  }, [mode, pivot]);

  const days = useMemo(() => daysArray(range.from, range.to), [range]);
  const weeks = useMemo(() => chunk(days, 7), [days]);
  const today = yyyyMmDd(new Date());
  const bookingsByDay = useMemo(() => {
    const map: Record<string, HotelBooking[]> = {};
    for (const booking of bookings) {
      if (!map[booking.date]) map[booking.date] = [];
      map[booking.date].push(booking);
    }
    return map;
  }, [bookings]);

  if (!loaded) return <div className="p-4 text-sm text-neutral-500">Caricamento...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-xl border px-3 py-2 text-sm shadow" onClick={goPrev}>Prev</button>
          {isMonth ? (
            <div className="text-lg font-semibold">{pivot.toLocaleString('it-IT', { month: 'long', year: 'numeric' })}</div>
          ) : (
            <div className="text-lg font-semibold">{rangeLabel}</div>
          )}
          <button type="button" className="rounded-xl border px-3 py-2 text-sm shadow" onClick={goNext}>Next</button>

          <div className="ml-2 flex items-center gap-1">
            <button type="button" onClick={() => setMode('week')} className={`rounded-xl border px-3 py-2 text-sm shadow ${mode === 'week' ? 'bg-black text-white' : ''}`}>Settimana</button>
            <button type="button" onClick={() => setMode('twoWeeks')} className={`rounded-xl border px-3 py-2 text-sm shadow ${mode === 'twoWeeks' ? 'bg-black text-white' : ''}`}>2 settimane</button>
            <button type="button" onClick={() => setMode('month')} className={`rounded-xl border px-3 py-2 text-sm shadow ${mode === 'month' ? 'bg-black text-white' : ''}`}>Mese</button>
            <button type="button" className="rounded-xl border px-3 py-2 text-sm shadow" onClick={() => setPivot(startOfDay(new Date()))}>Oggi</button>
            <button type="button" className="rounded-xl border px-3 py-2 text-sm shadow" onClick={() => openNew(yyyyMmDd(pivot))}>Nuova prenotazione</button>
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm shadow"
              onClick={() => setExportModal({
                open: true,
                from: yyyyMmDd(startOfWeekMonday(pivot)),
                to: yyyyMmDd(endOfWeekSunday(pivot)),
              })}
            >
              Esporta XLSX
            </button>
            <SendRequestModal hotels={hotels} />
          </div>
        </div>

        <Link href="/hub" className="rounded-xl border px-3 py-2 text-sm shadow">Hub</Link>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((day) => (
          <div key={day} className="px-2 py-1 text-xs font-medium">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="contents">
            {week.map((day, dayIndex) => {
              const key = yyyyMmDd(day);
              const dayBookings = bookingsByDay[key] ?? [];
              const isToday = key === today;
              const inMonth = day.getMonth() === pivot.getMonth();

              return (
                <div
                  key={`${weekIndex}-${dayIndex}`}
                  className={`flex min-h-[220px] flex-col gap-2 rounded-2xl border bg-white p-2 ${inMonth ? '' : 'opacity-40'} ${isToday ? 'ring-2 ring-black' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{day.getDate()}</div>
                  </div>
                  <div className="flex-1 space-y-2 overflow-auto">
                    {dayBookings.map((booking) => (
                      <HotelCard key={booking.id} booking={booking} onDelete={() => void deleteBooking(booking.id)} />
                    ))}
                    {dayBookings.length === 0 && <div className="text-xs text-neutral-500">Nessuna prenotazione</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Modal open={newModal.open && !!draft} title="Nuova prenotazione hotel" onClose={closeModals}>
        {draft && (
          <>
            <BookingForm
              value={draft}
              onChange={setDraft}
              hotels={hotels}
              territories={territories}
              rangeEnd={rangeEnd}
              onRangeEndChange={setRangeEnd}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-2" onClick={closeModals}>Annulla</button>
              <button type="button" className="rounded-lg border px-3 py-2 shadow" onClick={() => void saveDraft()}>Salva</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={editModal.open && !!draft} title="Modifica prenotazione hotel" onClose={closeModals}>
        {draft && (
          <>
            <BookingForm
              value={draft}
              onChange={setDraft}
              hotels={hotels}
              territories={territories}
              rangeEnd={draft.date}
              onRangeEndChange={() => undefined}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-2" onClick={closeModals}>Annulla</button>
              <button type="button" className="rounded-lg border px-3 py-2 shadow" onClick={() => void saveDraft()}>Salva</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={exportModal.open} title="Esporta prenotazioni" onClose={() => setExportModal((modal) => ({ ...modal, open: false }))}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <div className="mb-1">Dal</div>
              <input type="date" className="w-full rounded-lg border px-2 py-1 text-sm" value={exportModal.from} onChange={(event) => setExportModal((modal) => ({ ...modal, from: event.target.value }))} />
            </label>
            <label className="text-xs">
              <div className="mb-1">Al</div>
              <input type="date" className="w-full rounded-lg border px-2 py-1 text-sm" min={exportModal.from} value={exportModal.to} onChange={(event) => setExportModal((modal) => ({ ...modal, to: event.target.value }))} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border px-3 py-2" onClick={() => setExportModal((modal) => ({ ...modal, open: false }))}>Annulla</button>
            <button type="button" className="rounded-lg border px-3 py-2 shadow" onClick={() => void exportXlsx()}>Esporta</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function HotelCard({ booking, onDelete }: { booking: HotelBooking; onDelete: () => void }) {
  return (
    <div className={`rounded-xl border p-2 shadow-sm ${territoryCardClasses(booking.territory)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">{booking.hotelName}</div>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${territoryPillClasses(booking.territory)}`} title={booking.territory}>
            {booking.territory}
          </span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <div className="font-medium">Camera</div>
        <div>{booking.roomType}</div>
        <div className="font-medium">Prezzo camera</div>
        <div>{money(booking.roomPrice)}</div>
        <div className="font-medium">Cena totale</div>
        <div>{booking.dinnerPrice ? money(booking.dinnerPrice * (booking.guests?.length ?? 0)) : '-'}</div>
        <div className="font-medium">Note</div>
        <div className="truncate" title={booking.notes || ''}>{booking.notes || '-'}</div>
      </div>

      <div className="mt-2">
        <div className="mb-1 text-xs font-medium">Ospiti</div>
        <div className="flex flex-nowrap gap-1 overflow-x-auto">
          {booking.guests.map((guest) => (
            <span key={guest.id} className="whitespace-nowrap rounded-full border px-2 py-1 text-[10px]" title={guest.name}>{guest.name}</span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded-lg border px-2 py-1 text-xs shadow"
            onClick={() => window.dispatchEvent(new CustomEvent('hotel-edit', { detail: booking }))}
            aria-label={`Modifica prenotazione ${booking.id}`}
          >
            Modifica
          </button>
          <button
            type="button"
            className="rounded-lg border px-2 py-1 text-xs text-red-700 shadow"
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
