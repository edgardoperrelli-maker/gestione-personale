'use client';

import { useMemo, useState } from 'react';
import { geocodeTask } from '@/utils/routing';
import { formatStaffStartAddress, isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';

type Props = {
  initialStaff: Staff[];
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

function todayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function validityLabel(staff: Staff, today: string) {
  if (isStaffValidOnDay(staff, today, today)) return 'Valido';
  if (staff.valid_from && staff.valid_from > today) return 'Non ancora attivo';
  return 'Fuori validita';
}

export default function PersonaleClient({ initialStaff }: Props) {
  const [rows, setRows] = useState<Staff[]>(initialStaff);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const today = useMemo(() => todayIso(), []);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.display_name.toLowerCase().includes(term));
  }, [query, rows]);

  const updateRow = (id: string, patch: Partial<Staff>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleSave = async (row: Staff) => {
    if (savingId) return;
    if (row.valid_from && row.valid_to && row.valid_from > row.valid_to) {
      showFeedback('error', `Intervallo non valido per ${row.display_name}.`);
      return;
    }

    setSavingId(row.id);

    let startLat: number | null = null;
    let startLng: number | null = null;
    let geocodeFailed = false;
    const hasStartAddress = !!(row.start_address || row.start_cap || row.start_city);

    if (hasStartAddress) {
      const geocoded = await geocodeTask({
        id: `staff-${row.id}`,
        odl: '',
        indirizzo: row.start_address ?? '',
        cap: row.start_cap ?? '',
        citta: row.start_city ?? '',
        priorita: 0,
        fascia_oraria: '',
      });
      startLat = geocoded.lat ?? null;
      startLng = geocoded.lng ?? null;
      geocodeFailed = startLat === null || startLng === null;
    }

    try {
      const res = await fetch('/api/admin/personale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          validFrom: row.valid_from ?? null,
          validTo: row.valid_to ?? null,
          startAddress: row.start_address ?? null,
          startCap: row.start_cap ?? null,
          startCity: row.start_city ?? null,
          startLat,
          startLng,
        }),
      });
      const json = await res.json() as { error?: string; staff?: Staff };
      if (!res.ok) throw new Error(json.error ?? 'Errore salvataggio personale.');
      if (json.staff) updateRow(row.id, json.staff);
      showFeedback(
        'success',
        geocodeFailed
          ? `${row.display_name} salvato. Indirizzo di partenza registrato senza coordinate.`
          : `${row.display_name} aggiornato con successo.`
      );
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore salvataggio personale.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Personale</h1>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
            Gestisci validita e indirizzo di partenza degli operatori usati da cronoprogramma e mappa.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Cerca operatore
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome operatore..."
            className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {feedback && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
          style={
            feedback.type === 'success'
              ? { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#166534' }
              : { borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }
          }
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-4">
        {filteredRows.map((row) => {
          const saving = savingId === row.id;
          const startAddress = formatStaffStartAddress(row);
          const hasCoords = row.start_lat != null && row.start_lng != null;
          const status = validityLabel(row, today);

          return (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-[var(--brand-text-main)]">{row.display_name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[var(--brand-primary)]">
                      {status}
                    </span>
                    <span className="rounded-full border border-[var(--brand-border)] bg-white px-2 py-0.5 text-[var(--brand-text-muted)]">
                      {hasCoords ? 'Partenza geocodificata' : 'Partenza senza coordinate'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave(row)}
                  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_220px_minmax(0,1fr)_120px_200px]">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    Valido dal
                  </label>
                  <input
                    type="date"
                    value={row.valid_from ?? ''}
                    onChange={(e) => updateRow(row.id, { valid_from: e.target.value || null })}
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    Valido fino al
                  </label>
                  <input
                    type="date"
                    value={row.valid_to ?? ''}
                    onChange={(e) => updateRow(row.id, { valid_to: e.target.value || null })}
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    Indirizzo di partenza
                  </label>
                  <input
                    value={row.start_address ?? ''}
                    onChange={(e) => updateRow(row.id, { start_address: e.target.value })}
                    placeholder="Via, piazza, civico..."
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    CAP
                  </label>
                  <input
                    value={row.start_cap ?? ''}
                    onChange={(e) => updateRow(row.id, { start_cap: e.target.value })}
                    placeholder="00000"
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    Citta
                  </label>
                  <input
                    value={row.start_city ?? ''}
                    onChange={(e) => updateRow(row.id, { start_city: e.target.value })}
                    placeholder="Citta"
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3 text-xs text-[var(--brand-text-muted)]">
                {startAddress || 'Nessun indirizzo di partenza registrato.'}
                {hasCoords && row.start_lat != null && row.start_lng != null && (
                  <span>{` · ${row.start_lat.toFixed(5)}, ${row.start_lng.toFixed(5)}`}</span>
                )}
              </div>
            </div>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Nessun operatore trovato.
          </div>
        )}
      </div>
    </div>
  );
}
