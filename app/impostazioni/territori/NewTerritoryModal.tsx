'use client';

import { useEffect, useState } from 'react';
import type { Territory } from '@/types';

type Props = {
  onClose: () => void;
  onCreated: (territory: Territory) => void;
};

function validateDateRange(from: string | null, to: string | null): string | null {
  if (from && to && from > to) {
    return 'La data fine validita non puo precedere la data inizio.';
  }
  return null;
}

function validateCoordinates(lat: string, lng: string): string | null {
  if ((lat.trim() && !lng.trim()) || (!lat.trim() && lng.trim())) {
    return 'Inserisci sia latitudine sia longitudine, oppure lascia entrambi vuoti.';
  }
  if (lat.trim() && Number.isNaN(Number(lat))) {
    return 'Latitudine non valida.';
  }
  if (lng.trim() && Number.isNaN(Number(lng))) {
    return 'Longitudine non valida.';
  }
  return null;
}

export default function NewTerritoryModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validTo, setValidTo] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Nome territorio richiesto.');
      return;
    }

    const dateError = validateDateRange(validFrom, validTo);
    if (dateError) {
      setError(dateError);
      return;
    }

    const coordError = validateCoordinates(lat, lng);
    if (coordError) {
      setError(coordError);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/admin/territori', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          active,
          validFrom,
          validTo,
          lat: lat.trim() ? Number(lat) : null,
          lng: lng.trim() ? Number(lng) : null,
        }),
      });

      const json = await response.json() as { error?: string; territory?: Territory };
      if (!response.ok) {
        throw new Error(json.error ?? 'Errore creazione territorio.');
      }

      if (json.territory) {
        onCreated(json.territory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore creazione territorio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[min(680px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">Nuovo Territorio</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-600 hover:text-black"
            aria-label="Chiudi"
          >
            x
          </button>
        </div>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Nome territorio
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Es. Perugia"
              className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Valido dal
              </label>
              <input
                type="date"
                value={validFrom ?? ''}
                onChange={(event) => setValidFrom(event.target.value || null)}
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
                onChange={(event) => setValidTo(event.target.value || null)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Latitudine mappa
              </label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                placeholder="Es. 43.1107"
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Longitudine mappa
              </label>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                placeholder="Es. 12.3908"
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="h-4 w-4 accent-[var(--brand-primary)]"
            />
            Territorio attivo
          </label>

          <p className="text-xs text-[var(--brand-text-muted)]">
            Le coordinate sono opzionali, ma servono alla mappa per posizionare correttamente il territorio.
          </p>

          {error && (
            <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

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
