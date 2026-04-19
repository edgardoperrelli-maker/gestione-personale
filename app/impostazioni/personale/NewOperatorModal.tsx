'use client';

import { useState, useEffect } from 'react';
import { geocodeTask } from '@/utils/routing';
import type { Staff } from '@/types';

type Props = {
  onClose: () => void;
  onCreated: (newStaff: Staff) => void;
};

function validateDisplayName(name: string): string | null {
  if (!name.trim()) {
    return 'Nome operatore richiesto.';
  }
  return null;
}

function validateDateRange(from: string | null, to: string | null): string | null {
  if (from && to && from > to) {
    return 'La data fine validità non può precedere la data inizio.';
  }
  return null;
}

export default function NewOperatorModal({ onClose, onCreated }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validTo, setValidTo] = useState<string | null>(null);
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [startCap, setStartCap] = useState<string | null>(null);
  const [startCity, setStartCity] = useState<string | null>(null);
  const [homeAddress, setHomeAddress] = useState<string | null>(null);
  const [homeCap, setHomeCap] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function geocodeAddresses() {
    let startLat: number | null = null;
    let startLng: number | null = null;
    let homeLat: number | null = null;
    let homeLng: number | null = null;

    // Geocode magazzino if any field is filled
    if (startAddress || startCap || startCity) {
      const g = await geocodeTask({
        id: 'new-staff-magazzino',
        odl: '',
        indirizzo: startAddress ?? '',
        cap: startCap ?? '',
        citta: startCity ?? '',
        priorita: 0,
        fascia_oraria: '',
      });
      startLat = g.lat ?? null;
      startLng = g.lng ?? null;
    }

    // Geocode casa if any field is filled
    if (homeAddress || homeCap || homeCity) {
      const g = await geocodeTask({
        id: 'new-staff-casa',
        odl: '',
        indirizzo: homeAddress ?? '',
        cap: homeCap ?? '',
        citta: homeCity ?? '',
        priorita: 0,
        fascia_oraria: '',
      });
      homeLat = g.lat ?? null;
      homeLng = g.lng ?? null;
    }

    return { startLat, startLng, homeLat, homeLng };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous error
    setError(null);

    // Validate displayName
    const nameError = validateDisplayName(displayName);
    if (nameError) {
      setError(nameError);
      return;
    }

    // Validate date range
    const dateError = validateDateRange(validFrom, validTo);
    if (dateError) {
      setError(dateError);
      return;
    }

    setLoading(true);

    try {
      const { startLat, startLng, homeLat, homeLng } = await geocodeAddresses();

      const body = {
        displayName,
        validFrom,
        validTo,
        startAddress,
        startCap,
        startCity,
        startLat,
        startLng,
        homeAddress,
        homeCap,
        homeCity,
        homeLat,
        homeLng,
      };

      const res = await fetch('/api/admin/personale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json() as { error?: string; staff?: Staff };

      if (!res.ok) {
        throw new Error(json.error ?? 'Errore creazione operatore.');
      }

      // Success: call callback and close modal
      if (json.staff) {
        onCreated(json.staff);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore geocodificazione.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* modal */}
      <div className="absolute left-1/2 top-1/2 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Nuovo Operatore</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-600 hover:text-black"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <form className="px-5 py-4 space-y-4" onSubmit={handleSubmit}>
          {/* Nome */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Nome e Cognome
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nome operatore..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Valido dal
              </label>
              <input
                type="date"
                value={validFrom ?? ''}
                onChange={(e) => setValidFrom(e.target.value || null)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Valido fino al
              </label>
              <input
                type="date"
                value={validTo ?? ''}
                onChange={(e) => setValidTo(e.target.value || null)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Magazzino */}
          <div>
            <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Indirizzo magazzino
            </label>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_200px]">
              <div>
                <input
                  type="text"
                  value={startAddress ?? ''}
                  onChange={(e) => setStartAddress(e.target.value || null)}
                  placeholder="Via, piazza, civico..."
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={startCap ?? ''}
                  onChange={(e) => setStartCap(e.target.value || null)}
                  placeholder="CAP"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={startCity ?? ''}
                  onChange={(e) => setStartCity(e.target.value || null)}
                  placeholder="Città"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Casa */}
          <div>
            <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Indirizzo casa (reperibile)
            </label>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_200px]">
              <div>
                <input
                  type="text"
                  value={homeAddress ?? ''}
                  onChange={(e) => setHomeAddress(e.target.value || null)}
                  placeholder="Via, piazza, civico..."
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={homeCap ?? ''}
                  onChange={(e) => setHomeCap(e.target.value || null)}
                  placeholder="CAP"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={homeCity ?? ''}
                  onChange={(e) => setHomeCity(e.target.value || null)}
                  placeholder="Città"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Error feedback */}
          {error && (
            <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
            >
              {loading ? 'Creazione...' : 'Crea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
