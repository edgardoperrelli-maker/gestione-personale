'use client';

/* Portato sul sistema Cockpit: overlay `bg-black/60` fatto a mano + glifo ✕ +
 * raggi `rounded-2xl/xl/lg` fuori scala → primitivo Dialog e Button/Select/Input/
 * Textarea. Logica (invio richiesta email agli hotel, CC fisso) invariata. */

import { toast } from '@/components/ui/Toast';
import { useState } from 'react';
import { Mail, Plus, X } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/Input';
import Textarea from '@/components/ui/Textarea';
import type { Hotel } from '@/types';

const ROOM_OPTIONS = ['Singola', 'Doppia', 'Tripla', 'Quadrupla'] as const;

export default function SendRequestModal({ hotels }: { hotels: Hotel[] }) {
  const [open, setOpen] = useState(false);
  const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [rooms, setRooms] = useState<{ type: string }[]>([{ type: 'Singola' }]); // fino a 4
  const [note, setNote] = useState<string>('');
  const [sending, setSending] = useState(false);
  const canSend = Boolean(periodStart && periodEnd && selectedHotels.length > 0 && rooms.length > 0);

  const ccFixed = 'Christian.arragoni@plenzich.it';
  const destinatari = hotels.filter((hotel) => hotel.active && hotel.email);

  function toggleHotel(email: string) {
    setSelectedHotels((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }
  function addRoom() {
    setRooms((r) => (r.length >= 4 ? r : [...r, { type: 'Singola' }]));
  }
  function removeRoom(idx: number) {
    setRooms((r) => r.filter((_, i) => i !== idx));
  }
  function updateRoom(idx: number, type: string) {
    setRooms((r) => r.map((x, i) => (i === idx ? { type } : x)));
  }

  async function onSubmit() {
    if (!periodStart || !periodEnd) {
      toast.error('Inserisci periodo di inizio e fine.');
      return;
    }
    if (selectedHotels.length === 0) {
      toast.error('Seleziona almeno un hotel destinatario.');
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
          roomTypes: rooms.map((r) => r.type).join(', '),
          note,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Invio fallito');
      }

      toast.success('Richiesta inviata.');
      setOpen(false);
      setSelectedHotels([]);
      setPeriodStart('');
      setPeriodEnd('');
      setRooms([{ type: 'Singola' }]);
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore invio email');
    } finally {
      setSending(false);
    }
  }

  const labelCls = 'mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]';

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Mail size={14} aria-hidden />
        Invia richiesta
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invia richiesta prenotazione"
        className="sm:max-w-2xl"
        busy={sending}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Annulla</Button>
            <Button variant="primary" size="sm" onClick={() => void onSubmit()} loading={sending} disabled={!canSend}>Invia richiesta</Button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <span className={labelCls}>Camere <span className="font-normal text-[var(--brand-text-subtle)]">(max 4)</span></span>
            <div className="space-y-2">
              {rooms.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={r.type} onChange={(e) => updateRoom(idx, e.target.value)}>
                    {ROOM_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeRoom(idx)}
                    disabled={rooms.length === 1}
                    aria-label="Rimuovi camera"
                  >
                    <X size={14} aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <Button type="button" size="sm" variant="outline" onClick={addRoom} disabled={rooms.length >= 4}>
                <Plus size={14} aria-hidden />
                Aggiungi camera
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Dal</span>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelCls}>Al</span>
              <Input type="date" min={periodStart} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>

          <div>
            <span className={labelCls}>Hotel destinatari</span>
            {destinatari.length === 0 ? (
              <p className="text-sm text-[var(--brand-text-subtle)]">Nessun hotel con email. Aggiungili in Impostazioni → Hotel.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {destinatari.map((h) => {
                  const checked = selectedHotels.includes(h.email!);
                  return (
                    <label
                      key={h.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition ${checked ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--brand-border-strong)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-muted)]'}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                        checked={checked}
                        onChange={() => toggleHotel(h.email!)}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[var(--brand-text-main)]">{h.name}</div>
                        {h.territory && <div className="text-[11px] text-[var(--brand-text-subtle)]">{h.territory.name}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block">
            <span className={labelCls}>Messaggio <span className="font-normal text-[var(--brand-text-subtle)]">(opzionale)</span></span>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Inserisci dettagli aggiuntivi, numero camere, preferenze, ecc."
            />
          </label>

          <div className="text-xs text-[var(--brand-text-muted)]">
            CC fisso: <span className="font-medium text-[var(--brand-text-main)]">{ccFixed}</span>
          </div>
        </div>
      </Dialog>
    </>
  );
}
