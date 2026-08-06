'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Calendario delle prenotazioni hotel per le trasferte. Testa di modulo standard
 * (ObjectHeader) con i comandi; sotto, una control-bar con navigazione + periodo
 * + vista (settimana / 2 settimane / mese) e la griglia a sette colonne. Il
 * modulo nasceva prima del sistema Cockpit: il redesign ha portato il Modal
 * fatto a mano → primitivo Dialog, i <select>/<input>/<textarea> grezzi → Input/
 * Select/Textarea/MultiSelect, i glifi e le etichette inglesi → icone lucide, gli
 * importi → € in mono tabulare. Dati, fetch, realtime ed export invariati.
 */

import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Pencil, RotateCw, Trash2 } from 'lucide-react';
import SendRequestModal from './SendRequestModal';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import MultiSelect from '@/components/ui/MultiSelect';
import Dialog from '@/components/ui/Dialog';
import type { Hotel, Territory } from '@/types';
import { euroIt } from '@/utils/numero-it';

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

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'week', label: 'Settimana' },
  { key: 'twoWeeks', label: '2 settimane' },
  { key: 'month', label: 'Mese' },
];

// Colore per territorio dalla scala grafici sobria (--chart-*), non dai semantici:
// un territorio non è uno stato «errore/attenzione». Niente --chart-4 (rosso) né
// --brand-violet (retro-compat) — vedi DESIGN.md §3.
const TERRITORY_CHART: Record<string, string> = {
  FIRENZE: 'var(--chart-3)', // ambra
  PADOVA: 'var(--chart-5)', // viola
  PERUGIA: 'var(--chart-6)', // teal
  NAPOLI: 'var(--chart-1)', // blu
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

/** Colore categorico del territorio (grigio di riserva per i territori non mappati). */
function territoryColor(territory: string) {
  return TERRITORY_CHART[(territory || '').toUpperCase()] ?? 'var(--chart-8)';
}
/** Tinta traslucida di un colore, per i chip a fondo pieno senza bordo. */
function tint(color: string, pct: number) {
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`;
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
  if (value == null) return '—';
  return euroIt(value);
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

const labelCls = 'mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]';

function BookingForm({
  value,
  onChange,
  hotels,
  territories,
  rangeEnd,
  onRangeEndChange,
  showRange,
}: {
  value: HotelBooking;
  onChange: (next: HotelBooking) => void;
  hotels: Hotel[];
  territories: Territory[];
  rangeEnd: string | null;
  onRangeEndChange: (value: string) => void;
  showRange: boolean;
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

  // Opzioni ospiti: unione tra chi è già assegnato alla prenotazione e chi risulta
  // eleggibile dal cronoprogramma, così un ospite salvato resta visibile anche se
  // fuori dalla finestra corrente.
  const guestOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const guest of value.guests) map.set(guest.id, guest.name);
    for (const guest of eligibleGuests) map.set(guest.id, guest.name);
    return Array.from(map, ([id, name]) => ({ value: id, label: name }));
  }, [value.guests, eligibleGuests]);

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
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>Dal</span>
          <Input
            type="date"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
          />
        </label>
        {showRange && (
          <label className="block">
            <span className={labelCls}>Al</span>
            <Input
              type="date"
              value={rangeEnd ?? value.date}
              min={value.date}
              onChange={(event) => onRangeEndChange(event.target.value)}
            />
          </label>
        )}
      </div>

      <label className="block">
        <span className={labelCls}>Hotel</span>
        <Select
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
        </Select>
      </label>

      <div>
        <span className={labelCls}>Territorio</span>
        <span className="inline-flex rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary-text)]">
          {autoTerritoryName ? autoTerritoryName.toUpperCase() : 'Seleziona un hotel'}
        </span>
      </div>

      <label className="block">
        <span className={labelCls}>Tipologia camera</span>
        <Select
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
              {room.room_type} — {money(room.price_per_night)}/notte
              {room.dinner_price_per_person != null ? ` + cena ${money(Number(room.dinner_price_per_person))}/pers.` : ''}
            </option>
          ))}
        </Select>
        {selectedHotel && roomOptions.every((room) => !room.configured) && (
          <p className="mt-1 text-[11px] text-[var(--warning)]">
            Prezzi non configurati per questo hotel: puoi selezionare una tipologia base a {money(0)} o impostare i prezzi in Impostazioni → Hotel.
          </p>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3 text-xs">
        <div>
          <div className="text-[var(--brand-text-muted)]">Prezzo camera</div>
          <div className="font-mono font-semibold tabular-nums text-[var(--brand-text-main)]">{money(value.roomPrice)}</div>
        </div>
        <div>
          <div className="text-[var(--brand-text-muted)]">Cena per persona</div>
          <div className="font-mono font-semibold tabular-nums text-[var(--brand-text-main)]">{money(value.dinnerPrice)}</div>
        </div>
      </div>

      <label className="block">
        <span className={labelCls}>Note</span>
        <Textarea
          rows={3}
          value={value.notes ?? ''}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={`${labelCls} mb-0`}>Ospiti</span>
          {autoTerritoryId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void populateFromCronoprogramma()}
            >
              <RotateCw size={13} aria-hidden />
              Aggiorna da cronoprogramma
            </Button>
          )}
        </div>
        <MultiSelect
          label="Ospiti"
          ariaLabel="Seleziona ospiti"
          options={guestOptions}
          values={value.guests.map((guest) => guest.id)}
          triggerClassName="border border-[var(--brand-border-strong)] bg-[var(--brand-surface)]"
          onChange={(ids) => {
            const pool = new Map<string, Guest>();
            for (const guest of value.guests) pool.set(guest.id, guest);
            for (const guest of eligibleGuests) pool.set(guest.id, guest);
            const next = ids.flatMap((id) => {
              const guest = pool.get(id);
              return guest ? [guest] : [];
            });
            onChange({ ...value, guests: next });
          }}
        />
        <p className="text-[11px] text-[var(--brand-text-subtle)]">
          {loadingGuests
            ? 'Caricamento operatori dal cronoprogramma…'
            : 'Sono mostrati solo gli operatori assegnati nel cronoprogramma a questo territorio; i residenti sono esclusi.'}
        </p>
      </div>
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
  const [daEliminare, setDaEliminare] = useState<string | null>(null);
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
  const fmtShort = (date: Date) => date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  const fmtLong = (date: Date) => date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

  function deleteBooking(id: string) {
    setDaEliminare(id);
  }

  async function deleteBookingConfermata(id: string) {
    setDaEliminare(null);
    const previous = bookings;
    setBookings(previous.filter((booking) => booking.id !== id));
    const { error } = await supabase.from('hotel_bookings').delete().eq('id', id);
    if (error) {
      setBookings(previous);
      toast.error('Eliminazione non riuscita, prenotazione ripristinata.');
    }
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

  const periodLabel = isMonth
    ? (() => {
        const raw = pivot.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      })()
    : `${fmtShort(range.from)} – ${fmtLong(range.to)}`;

  if (!loaded) return <div className="p-4 text-sm text-[var(--brand-text-subtle)]">Caricamento…</div>;

  return (
    <div className="space-y-4">
      <ObjectHeader
        title="Calendario hotel"
        sub="Prenotazioni hotel per le trasferte."
        actions={
          <>
            <Button size="sm" variant="primary" onClick={() => openNew(yyyyMmDd(pivot))}>
              <CalendarPlus size={14} aria-hidden />
              Nuova prenotazione
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExportModal({
                open: true,
                from: yyyyMmDd(startOfWeekMonday(pivot)),
                to: yyyyMmDd(endOfWeekSunday(pivot)),
              })}
            >
              <Download size={14} aria-hidden />
              Esporta XLSX
            </Button>
            <SendRequestModal hotels={hotels} />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" aria-label="Periodo precedente" onClick={goPrev}>
              <ChevronLeft size={16} aria-hidden />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPivot(startOfDay(new Date()))}>Oggi</Button>
            <Button size="sm" variant="outline" aria-label="Periodo successivo" onClick={goNext}>
              <ChevronRight size={16} aria-hidden />
            </Button>
          </div>
          <div className="font-mono text-base font-semibold tabular-nums text-[var(--brand-text-main)]">{periodLabel}</div>
        </div>

        <div className="inline-flex items-center gap-1">
          {VIEW_MODES.map((view) => (
            <Button
              key={view.key}
              size="sm"
              variant={mode === view.key ? 'soft' : 'outline'}
              aria-pressed={mode === view.key}
              onClick={() => setMode(view.key)}
            >
              {view.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop/tablet (≥ md): griglia mese a 7 colonne */}
      <div className="hidden space-y-2 md:block">
        <div className="grid grid-cols-7 gap-2">
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((day) => (
            <div key={day} className="px-2 py-1 text-xs font-medium text-[var(--brand-text-muted)]">{day}</div>
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
                    className={`flex min-h-[220px] flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2 shadow-[var(--shadow-sm)] ${inMonth ? '' : 'opacity-40'} ${isToday ? 'ring-2 ring-[var(--brand-primary)]' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`font-mono text-sm font-semibold tabular-nums ${isToday ? 'text-[var(--primary-text)]' : 'text-[var(--brand-text-main)]'}`}>{day.getDate()}</div>
                    </div>
                    <div className="flex-1 space-y-2 overflow-auto">
                      {dayBookings.map((booking) => (
                        <HotelCard
                          key={booking.id}
                          booking={booking}
                          onEdit={() => openEdit(booking)}
                          onDelete={() => void deleteBooking(booking.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile (< md): agenda a colonna singola — la griglia a 7 colonne è illeggibile sotto md */}
      <div className="space-y-4 md:hidden">
        {(() => {
          const conPrenotazioni = days.filter((day) => (bookingsByDay[yyyyMmDd(day)] ?? []).length > 0);
          if (conPrenotazioni.length === 0) {
            return (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border)] px-4 py-10 text-center text-sm text-[var(--brand-text-muted)]">
                Nessuna prenotazione nel periodo.
              </div>
            );
          }
          return conPrenotazioni.map((day) => {
            const key = yyyyMmDd(day);
            const isToday = key === today;
            return (
              <section key={key}>
                <h3 className="mb-2 flex items-baseline gap-2 border-b border-[var(--brand-border)] pb-1">
                  <span className={`text-sm font-semibold capitalize ${isToday ? 'text-[var(--primary-text)]' : 'text-[var(--brand-text-main)]'}`}>
                    {day.toLocaleDateString('it-IT', { weekday: 'long' })}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                    {day.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                  </span>
                </h3>
                <div className="space-y-2">
                  {(bookingsByDay[key] ?? []).map((booking) => (
                    <HotelCard
                      key={booking.id}
                      booking={booking}
                      onEdit={() => openEdit(booking)}
                      onDelete={() => void deleteBooking(booking.id)}
                    />
                  ))}
                </div>
              </section>
            );
          });
        })()}
      </div>

      <Dialog
        open={newModal.open && !!draft}
        onClose={closeModals}
        title="Nuova prenotazione hotel"
        className="sm:max-w-xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModals}>Annulla</Button>
            <Button variant="primary" size="sm" onClick={() => void saveDraft()}>Salva</Button>
          </>
        }
      >
        {draft && (
          <BookingForm
            value={draft}
            onChange={setDraft}
            hotels={hotels}
            territories={territories}
            rangeEnd={rangeEnd}
            onRangeEndChange={setRangeEnd}
            showRange
          />
        )}
      </Dialog>

      <Dialog
        open={editModal.open && !!draft}
        onClose={closeModals}
        title="Modifica prenotazione hotel"
        className="sm:max-w-xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModals}>Annulla</Button>
            <Button variant="primary" size="sm" onClick={() => void saveDraft()}>Salva</Button>
          </>
        }
      >
        {draft && (
          <BookingForm
            value={draft}
            onChange={setDraft}
            hotels={hotels}
            territories={territories}
            rangeEnd={draft.date}
            onRangeEndChange={() => undefined}
            showRange={false}
          />
        )}
      </Dialog>

      <Dialog
        open={exportModal.open}
        onClose={() => setExportModal((modal) => ({ ...modal, open: false }))}
        title="Esporta prenotazioni"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setExportModal((modal) => ({ ...modal, open: false }))}>Annulla</Button>
            <Button variant="primary" size="sm" onClick={() => void exportXlsx()}>
              <Download size={14} aria-hidden />
              Esporta
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Dal</span>
            <Input type="date" value={exportModal.from} onChange={(event) => setExportModal((modal) => ({ ...modal, from: event.target.value }))} />
          </label>
          <label className="block">
            <span className={labelCls}>Al</span>
            <Input type="date" min={exportModal.from} value={exportModal.to} onChange={(event) => setExportModal((modal) => ({ ...modal, to: event.target.value }))} />
          </label>
        </div>
      </Dialog>

      <ConfirmDialog
        open={daEliminare !== null}
        title="Eliminare questa prenotazione?"
        message="La prenotazione viene rimossa dal calendario hotel."
        confirmLabel="Elimina"
        danger
        onConfirm={() => daEliminare && void deleteBookingConfermata(daEliminare)}
        onClose={() => setDaEliminare(null)}
      />
    </div>
  );
}

function HotelCard({ booking, onEdit, onDelete }: { booking: HotelBooking; onEdit: () => void; onDelete: () => void }) {
  // Chip a fondo pieno senza bordo: la cella-giorno è l'unico livello bordato.
  const colore = territoryColor(booking.territory);
  return (
    <div className="rounded-[var(--radius-md)] p-2" style={{ backgroundColor: tint(colore, 14) }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-semibold text-[var(--brand-text-main)]">{booking.hotelName}</div>
          {booking.territory && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ color: colore, backgroundColor: tint(colore, 20) }}
            >
              {booking.territory}
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <div className="font-medium text-[var(--brand-text-muted)]">Camera</div>
        <div className="text-[var(--brand-text-main)]">{booking.roomType || '—'}</div>
        <div className="font-medium text-[var(--brand-text-muted)]">Prezzo camera</div>
        <div className="font-mono tabular-nums text-[var(--brand-text-main)]">{money(booking.roomPrice)}</div>
        <div className="font-medium text-[var(--brand-text-muted)]">Cena totale</div>
        <div className="font-mono tabular-nums text-[var(--brand-text-main)]">{booking.dinnerPrice ? money(booking.dinnerPrice * (booking.guests?.length ?? 0)) : '—'}</div>
        <div className="font-medium text-[var(--brand-text-muted)]">Note</div>
        {/* Note: unico valore troncato → il `title` nativo rivela il testo intero. */}
        <div className="min-w-0 truncate text-[var(--brand-text-main)]" title={booking.notes || undefined}>{booking.notes || '—'}</div>
      </div>

      {booking.guests.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium text-[var(--brand-text-muted)]">Ospiti</div>
          <div className="flex flex-nowrap gap-1 overflow-x-auto">
            {booking.guests.map((guest) => (
              <span key={guest.id} className="whitespace-nowrap rounded-full bg-[var(--brand-surface)] px-2 py-1 text-[11px] text-[var(--brand-text-main)]">{guest.name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit} aria-label={`Modifica prenotazione ${booking.hotelName}`}>
          <Pencil size={13} aria-hidden />
          Modifica
        </Button>
        <Button size="sm" variant="outline" className="text-[var(--danger)]" onClick={onDelete} aria-label={`Elimina prenotazione ${booking.hotelName}`}>
          <Trash2 size={13} aria-hidden />
          Elimina
        </Button>
      </div>
    </div>
  );
}
