'use client';

import { useState } from 'react';

type Hotel = { name: string; email: string };

const HOTELS: Hotel[] = [
  { name: 'Hotel Alex',       email: 'info@hotelalexfirenze.com' },
  { name: 'Hotel Gate',       email: 'info@thegatehotel.it' },
  { name: 'Hotel Mirage',     email: 'info@hotelmirage.it' },
  { name: 'Fantastic Hotel',  email: 'info@fantastic-garden.com' }, // come richiesto
  { name: 'Hotel Florentia',  email: 'info@florentialivingstates.com' },
  { name: 'Test Hotel',       email: 'edgardo.perrelli@plenzich.it' },
];
const ROOM_OPTIONS = ['Singola', 'Doppia', 'Tripla', 'Quadrupla'] as const;

export default function SendRequestModal() {
const [open, setOpen] = useState(false);
const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
const [periodStart, setPeriodStart] = useState<string>('');
const [periodEnd, setPeriodEnd] = useState<string>('');
const [rooms, setRooms] = useState<{ type: string }[]>([{ type: 'Singola' }]); // fino a 4
const [note, setNote] = useState<string>('');
const [sending, setSending] = useState(false);
const canSend = Boolean(periodStart && periodEnd && selectedHotels.length > 0 && rooms.length > 0);


  const ccFixed = 'Christian.arragoni@plenzich.it';

  function toggleHotel(email: string) {
    setSelectedHotels(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  }
function addRoom() {
  setRooms(r => (r.length >= 4 ? r : [...r, { type: 'Singola' }]));
}
function removeRoom(idx: number) {
  setRooms(r => r.filter((_, i) => i !== idx));
}
function updateRoom(idx: number, type: string) {
  setRooms(r => r.map((x, i) => (i === idx ? { type } : x)));
}

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!periodStart || !periodEnd) {
    alert('Inserisci periodo di inizio e fine.');
    return;
  }
  if (selectedHotels.length === 0) {
    alert('Seleziona almeno un hotel destinatario.');
    return;
  }

  try {
    setSending(true);
    const res = await fetch('/api/hotel-booking/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
  to: selectedHotels,
  periodStart,
  periodEnd,
  roomTypes: rooms.map(r => r.type).join(', '),
  note,
}),


    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || 'Invio fallito');
    }

    alert('Richiesta inviata.');
    setOpen(false);
    // reset campi se serve
setSelectedHotels([]);
setPeriodStart('');
setPeriodEnd('');
setRooms([{ type: 'Singola' }]);
setNote('');

  } catch (err: any) {
    alert(err?.message || 'Errore invio email');
  } finally {
    setSending(false);
  }
}


  return (
    <>
      <button
        className="px-3 py-2 rounded-xl bg-black text-white text-sm"
        onClick={() => setOpen(true)}
      >
        Invia richiesta
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* modal */}
          <div className="absolute left-1/2 top-1/2 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold">Invia richiesta prenotazione</h2>
              <button
                className="text-sm text-neutral-600 hover:text-black"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
              >
                ✕
              </button>
            </div>

            <form className="px-5 py-4 space-y-4" onSubmit={onSubmit}>
              {/* Tipologie camere */}
              <div>
<div>
  <label className="block text-sm font-medium mb-2">Camere</label>

  <div className="space-y-2">
    {rooms.map((r, idx) => (
      <div key={idx} className="flex items-center gap-2">
        <select
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          value={r.type}
          onChange={(e) => updateRoom(idx, e.target.value)}
        >
          {ROOM_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <button
          type="button"
          className="px-2 py-2 rounded-lg border text-xs"
          onClick={() => removeRoom(idx)}
          disabled={rooms.length === 1}
          title="Rimuovi camera"
        >
          Rimuovi
        </button>
      </div>
    ))}
  </div>

  <div className="mt-2">
    <button
      type="button"
      className="px-3 py-2 rounded-lg border text-sm"
      onClick={addRoom}
      disabled={rooms.length >= 4}
      title="Aggiungi fino a 4 camere"
    >
      Aggiungi camera
    </button>
    <span className="ml-2 text-xs text-neutral-500">Max 4 camere</span>
  </div>
</div>

              </div>

              {/* Periodo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Dal
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={periodStart}
                    onChange={e => setPeriodStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Al
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={periodEnd}
                    onChange={e => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* Destinatari */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Seleziona hotel destinatari
                </label>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {HOTELS.map(h => (
  <label key={`${h.name}|${h.email}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">

      <input
        type="checkbox"
        checked={selectedHotels.includes(h.email)}
        onChange={() => toggleHotel(h.email)}
      />
      <span className="font-medium">{h.name}</span>
    </label>
  ))}
</div>

              </div>

              {/* Messaggio opzionale */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Messaggio (opzionale)
                </label>
                <textarea
                  className="w-full min-h-[90px] rounded-lg border px-3 py-2 text-sm"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Inserisci dettagli aggiuntivi, numero camere, preferenze, ecc."
                />
              </div>

              {/* CC fisso */}
              <div className="text-xs text-neutral-600">
                CC fisso: <span className="font-medium">{ccFixed}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border text-sm"
                  onClick={() => setOpen(false)}
                >
                  Annulla
                </button>
            
<button
  type="submit"
  disabled={sending || !canSend}
  className="px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60"
>
  {sending ? 'Invio…' : 'Invia richiesta'}
</button>


              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
