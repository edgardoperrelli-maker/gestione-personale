'use client';

import { useState } from 'react';
import SettingsSubNav from '@/components/layout/SettingsSubNav';
import type { Hotel, HotelRoomPrice, Territory } from '@/types';

type Feedback = { type: 'success' | 'error'; text: string } | null;

function sortHotels(rows: Hotel[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return '-';
  return `EUR ${Number(value).toFixed(2)}`;
}

function normalizeStars(value: number | null | undefined) {
  if (!value || value < 1 || value > 5) return 3;
  return value;
}

function StarRating({ value }: { value: number }) {
  const stars = normalizeStars(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-[13px] leading-none text-[var(--brand-primary)]" aria-label={`${stars} stelle`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index}>{index < stars ? '★' : '☆'}</span>
      ))}
    </span>
  );
}

export default function HotelClient({
  initialHotels,
  territories,
}: {
  initialHotels: Hotel[];
  territories: Territory[];
}) {
  const [hotels, setHotels] = useState<Hotel[]>(sortHotels(initialHotels));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTerritoryId, setNewTerritoryId] = useState('');
  const [newStars, setNewStars] = useState(3);
  const [showNewForm, setShowNewForm] = useState(false);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const createHotel = async () => {
    if (!newName.trim()) {
      showFeedback('error', 'Nome richiesto.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail || null,
          territory_id: newTerritoryId || null,
          stars: newStars,
        }),
      });
      const json = await res.json() as { error?: string; hotel?: Hotel };
      if (!res.ok || !json.hotel) throw new Error(json.error ?? 'Errore creazione hotel.');
      setHotels((prev) => sortHotels([...prev, json.hotel!]));
      setNewName('');
      setNewEmail('');
      setNewTerritoryId('');
      setNewStars(3);
      setShowNewForm(false);
      showFeedback('success', `${json.hotel.name} aggiunto.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore creazione hotel.');
    } finally {
      setBusy(false);
    }
  };

  const patchHotel = async (id: string, patch: Partial<Hotel>) => {
    const res = await fetch('/api/admin/hotels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json() as { error?: string; hotel?: Hotel };
    if (!res.ok || !json.hotel) throw new Error(json.error ?? 'Errore salvataggio hotel.');
    setHotels((prev) => sortHotels(prev.map((hotel) => (hotel.id === id ? json.hotel! : hotel))));
  };

  const deactivateHotel = async (hotel: Hotel) => {
    if (!window.confirm(`Disattivare "${hotel.name}"?`)) return;
    try {
      await patchHotel(hotel.id, { active: false });
      showFeedback('success', `${hotel.name} disattivato.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore disattivazione hotel.');
    }
  };

  const addRoomPrice = async (hotelId: string, roomType: string, pricePerNight: number, dinnerPrice: number | null) => {
    if (!roomType.trim()) {
      showFeedback('error', 'Tipologia richiesta.');
      return;
    }
    const res = await fetch('/api/admin/hotel-room-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotel_id: hotelId,
        room_type: roomType.trim(),
        price_per_night: pricePerNight,
        dinner_price_per_person: dinnerPrice,
      }),
    });
    const json = await res.json() as { error?: string; row?: HotelRoomPrice };
    if (!res.ok || !json.row) {
      showFeedback('error', json.error ?? 'Errore creazione prezzo.');
      return;
    }
    setHotels((prev) => prev.map((hotel) => (
      hotel.id === hotelId
        ? { ...hotel, room_prices: [...(hotel.room_prices ?? []), json.row!] }
        : hotel
    )));
  };

  const patchRoomPrice = async (hotelId: string, rowId: string, patch: Partial<HotelRoomPrice>) => {
    const res = await fetch('/api/admin/hotel-room-prices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, ...patch }),
    });
    const json = await res.json() as { error?: string; row?: HotelRoomPrice };
    if (!res.ok || !json.row) {
      showFeedback('error', json.error ?? 'Errore salvataggio prezzo.');
      return;
    }
    setHotels((prev) => prev.map((hotel) => (
      hotel.id === hotelId
        ? { ...hotel, room_prices: (hotel.room_prices ?? []).map((row) => (row.id === rowId ? json.row! : row)) }
        : hotel
    )));
  };

  const deleteRoomPrice = async (hotelId: string, rowId: string) => {
    const res = await fetch('/api/admin/hotel-room-prices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId }),
    });
    if (!res.ok) {
      showFeedback('error', 'Errore eliminazione.');
      return;
    }
    setHotels((prev) => prev.map((hotel) => (
      hotel.id === hotelId
        ? { ...hotel, room_prices: (hotel.room_prices ?? []).filter((row) => row.id !== rowId) }
        : hotel
    )));
  };

  return (
    <div className="space-y-6">
      <SettingsSubNav />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-text-main)]">Hotel</h1>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
            Strutture ricettive per trasferte: territorio, email e prezzi correnti per tipologia camera.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm((value) => !value)}
          className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)]"
        >
          {showNewForm ? 'Annulla' : '+ Nuovo hotel'}
        </button>
      </div>

      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          feedback.type === 'success'
            ? 'border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 text-[var(--brand-text-main)]'
            : 'border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
        }`}>
          {feedback.text}
        </div>
      )}

      {showNewForm && (
        <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold">Nuovo hotel</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Nome *</label>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
                placeholder="es. Hotel Alex"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Email</label>
              <input
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                type="email"
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
                placeholder="info@hotel.it"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Territorio</label>
              <select
                value={newTerritoryId}
                onChange={(event) => setNewTerritoryId(event.target.value)}
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
              >
                <option value="">Nessuno</option>
                {territories.filter((territory) => territory.active !== false).map((territory) => (
                  <option key={territory.id} value={territory.id}>{territory.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Stelle</label>
              <select
                value={newStars}
                onChange={(event) => setNewStars(Number(event.target.value))}
                className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((stars) => (
                  <option key={stars} value={stars}>{stars} {stars === 1 ? 'stella' : 'stelle'}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createHotel()}
              className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-60"
            >
              Salva hotel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {hotels.map((hotel) => (
          <HotelRow
            key={hotel.id}
            hotel={hotel}
            territories={territories}
            expanded={expandedId === hotel.id}
            onToggle={() => setExpandedId((id) => (id === hotel.id ? null : hotel.id))}
            onPatch={(patch) => patchHotel(hotel.id, patch).catch((err: unknown) => {
              showFeedback('error', err instanceof Error ? err.message : 'Errore salvataggio hotel.');
            })}
            onDeactivate={() => void deactivateHotel(hotel)}
            onAddRoomPrice={(roomType, price, dinner) => void addRoomPrice(hotel.id, roomType, price, dinner)}
            onPatchRoomPrice={(rowId, patch) => void patchRoomPrice(hotel.id, rowId, patch)}
            onDeleteRoomPrice={(rowId) => void deleteRoomPrice(hotel.id, rowId)}
          />
        ))}
        {hotels.length === 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center text-sm text-[var(--brand-text-muted)]">
            Nessun hotel. Aggiungine uno con il pulsante in alto.
          </div>
        )}
      </div>
    </div>
  );
}

function HotelRow({
  hotel,
  territories,
  expanded,
  onToggle,
  onPatch,
  onDeactivate,
  onAddRoomPrice,
  onPatchRoomPrice,
  onDeleteRoomPrice,
}: {
  hotel: Hotel;
  territories: Territory[];
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Hotel>) => void;
  onDeactivate: () => void;
  onAddRoomPrice: (roomType: string, price: number, dinner: number | null) => void;
  onPatchRoomPrice: (id: string, patch: Partial<HotelRoomPrice>) => void;
  onDeleteRoomPrice: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(hotel.name);
  const [email, setEmail] = useState(hotel.email ?? '');
  const [territoryId, setTerritoryId] = useState(hotel.territory_id ?? '');
  const [stars, setStars] = useState(normalizeStars(hotel.stars));
  const [newRoomType, setNewRoomType] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDinner, setNewDinner] = useState('');
  const [showRoomForm, setShowRoomForm] = useState(false);

  const saveHotel = () => {
    onPatch({ name: name.trim(), email: email || null, territory_id: territoryId || null, stars });
    setEditing(false);
  };

  const saveRoomPrice = () => {
    const price = Number(newPrice);
    const dinner = newDinner ? Number(newDinner) : null;
    if (!newRoomType.trim() || !Number.isFinite(price)) return;
    onAddRoomPrice(newRoomType.trim(), price, dinner != null && Number.isFinite(dinner) ? dinner : null);
    setNewRoomType('');
    setNewPrice('');
    setNewDinner('');
    setShowRoomForm(false);
  };

  return (
    <div className={`rounded-2xl border bg-white shadow-sm ${hotel.active ? 'border-[var(--brand-border)]' : 'border-neutral-200 opacity-60'}`}>
      <div className="flex items-center justify-between px-5 py-4">
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${hotel.active ? 'bg-green-500' : 'bg-neutral-300'}`} />
          <div>
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <span>{hotel.name}</span>
              <StarRating value={hotel.stars ?? 3} />
            </div>
            <div className="text-xs text-[var(--brand-text-muted)]">
              {hotel.territory?.name ?? '-'}{hotel.email ? ` - ${hotel.email}` : ''} - {(hotel.room_prices ?? []).length} tipologie
            </div>
          </div>
        </button>
        <div className="ml-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing((value) => !value);
              if (!expanded) onToggle();
            }}
            className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs"
          >
            {editing ? 'Annulla' : 'Modifica'}
          </button>
          {hotel.active && (
            <button type="button" onClick={onDeactivate} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs text-[var(--brand-primary)]">
              Disattiva
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-5 border-t border-[var(--brand-border)] px-5 py-4">
          {editing && (
            <div className="grid gap-3 rounded-xl bg-[var(--brand-bg)] p-4 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Nome</label>
                <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Email</label>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Territorio</label>
                <select value={territoryId} onChange={(event) => setTerritoryId(event.target.value)} className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm">
                  <option value="">Nessuno</option>
                  {territories.filter((territory) => territory.active !== false).map((territory) => (
                    <option key={territory.id} value={territory.id}>{territory.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Stelle</label>
                <select value={stars} onChange={(event) => setStars(Number(event.target.value))} className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>{rating} {rating === 1 ? 'stella' : 'stelle'}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end sm:col-span-4">
                <button type="button" onClick={saveHotel} className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
                  Salva
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Tipologie camera e prezzi correnti</p>
              <button type="button" onClick={() => setShowRoomForm((value) => !value)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs">
                {showRoomForm ? 'Annulla' : '+ Aggiungi tipologia'}
              </button>
            </div>

            {showRoomForm && (
              <div className="mb-4 grid gap-3 rounded-xl border border-[var(--brand-border)] p-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-[var(--brand-text-muted)]">Tipologia *</label>
                  <input value={newRoomType} onChange={(event) => setNewRoomType(event.target.value)} placeholder="es. Singola, Doppia" className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--brand-text-muted)]">EUR/notte *</label>
                  <input value={newPrice} onChange={(event) => setNewPrice(event.target.value)} type="number" min="0" step="0.01" className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--brand-text-muted)]">Cena per persona</label>
                  <input value={newDinner} onChange={(event) => setNewDinner(event.target.value)} type="number" min="0" step="0.01" className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm" />
                </div>
                <div className="flex justify-end sm:col-span-4">
                  <button type="button" onClick={saveRoomPrice} className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
                    Aggiungi
                  </button>
                </div>
              </div>
            )}

            {(hotel.room_prices ?? []).length === 0 ? (
              <p className="text-sm text-[var(--brand-text-muted)]">Nessuna tipologia impostata.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-[var(--brand-text-muted)]">
                      <th className="pb-2 text-left">Tipologia</th>
                      <th className="pb-2 text-right">EUR/notte</th>
                      <th className="pb-2 text-right">Cena per persona</th>
                      <th className="pb-2 pl-3 text-left">Note</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(hotel.room_prices ?? []).map((roomPrice) => (
                      <RoomPriceRow
                        key={roomPrice.id}
                        roomPrice={roomPrice}
                        onSave={(patch) => onPatchRoomPrice(roomPrice.id, patch)}
                        onDelete={() => onDeleteRoomPrice(roomPrice.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoomPriceRow({
  roomPrice,
  onSave,
  onDelete,
}: {
  roomPrice: HotelRoomPrice;
  onSave: (patch: Partial<HotelRoomPrice>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [roomType, setRoomType] = useState(roomPrice.room_type);
  const [price, setPrice] = useState(String(roomPrice.price_per_night));
  const [dinner, setDinner] = useState(roomPrice.dinner_price_per_person != null ? String(roomPrice.dinner_price_per_person) : '');
  const [notes, setNotes] = useState(roomPrice.notes ?? '');

  const save = () => {
    onSave({
      room_type: roomType.trim(),
      price_per_night: Number(price) || 0,
      dinner_price_per_person: dinner ? Number(dinner) : null,
      notes: notes || null,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b">
        <td className="py-2 pr-2"><input value={roomType} onChange={(event) => setRoomType(event.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm" /></td>
        <td className="py-2 pr-2"><input value={price} onChange={(event) => setPrice(event.target.value)} type="number" className="w-24 rounded-lg border px-2 py-1 text-right text-sm" /></td>
        <td className="py-2 pr-2"><input value={dinner} onChange={(event) => setDinner(event.target.value)} type="number" className="w-24 rounded-lg border px-2 py-1 text-right text-sm" /></td>
        <td className="py-2 pl-3"><input value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-lg border px-2 py-1 text-sm" /></td>
        <td className="whitespace-nowrap py-2 text-right">
          <button type="button" onClick={save} className="mr-1 rounded-lg border px-2 py-1 text-xs">Salva</button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border px-2 py-1 text-xs">X</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0 hover:bg-neutral-50">
      <td className="py-2 font-medium">{roomPrice.room_type}</td>
      <td className="py-2 text-right">{formatMoney(roomPrice.price_per_night)}</td>
      <td className="py-2 text-right">{formatMoney(roomPrice.dinner_price_per_person)}</td>
      <td className="py-2 pl-3 text-[var(--brand-text-muted)]">{roomPrice.notes || '-'}</td>
      <td className="whitespace-nowrap py-2 text-right">
        <button type="button" onClick={() => setEditing(true)} className="mr-1 rounded-lg border px-2 py-1 text-xs">Modifica</button>
        <button type="button" onClick={onDelete} className="rounded-lg border px-2 py-1 text-xs text-[var(--brand-primary)]">Elimina</button>
      </td>
    </tr>
  );
}
