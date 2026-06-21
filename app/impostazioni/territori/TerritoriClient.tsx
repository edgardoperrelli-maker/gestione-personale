'use client';

import { useMemo, useState } from 'react';
import { isTerritoryValidOnDay } from '@/lib/territories';
import NewTerritoryModal from './NewTerritoryModal';
import type { Territory } from '@/types';

type Props = {
  initialTerritories: Territory[];
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

function todayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function territoryStatus(territory: Territory, today: string) {
  if (territory.active === false) return 'Disattivato';
  if (isTerritoryValidOnDay(territory, today, today)) return 'Valido';
  if (territory.valid_from && territory.valid_from > today) return 'Non ancora attivo';
  return 'Scaduto';
}

function sortTerritories(rows: Territory[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
}

export default function TerritoriClient({ initialTerritories }: Props) {
  const [rows, setRows] = useState<Territory[]>(sortTerritories(initialTerritories));
  const [query, setQuery] = useState('');
  const [validityFilter, setValidityFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const today = useMemo(() => todayIso(), []);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    let filtered = rows;

    if (term) {
      filtered = filtered.filter((row) => row.name.toLowerCase().includes(term));
    }

    if (activityFilter === 'active') {
      filtered = filtered.filter((row) => row.active !== false);
    } else if (activityFilter === 'inactive') {
      filtered = filtered.filter((row) => row.active === false);
    }

    if (validityFilter === 'valid') {
      filtered = filtered.filter((row) => isTerritoryValidOnDay(row, today, today));
    } else if (validityFilter === 'invalid') {
      filtered = filtered.filter((row) => !isTerritoryValidOnDay(row, today, today));
    }

    return filtered;
  }, [activityFilter, query, rows, today, validityFilter]);

  const stats = useMemo(() => {
    const valid = rows.filter((row) => isTerritoryValidOnDay(row, today, today)).length;
    const active = rows.filter((row) => row.active !== false).length;
    const withCoords = rows.filter((row) => row.lat != null && row.lng != null).length;
    return {
      total: rows.length,
      valid,
      active,
      withCoords,
    };
  }, [rows, today]);

  const updateRow = (id: string, patch: Partial<Territory>) => {
    setRows((prev) => sortTerritories(prev.map((row) => (row.id === id ? { ...row, ...patch } : row))));
  };

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleTerritoryCreated = (territory: Territory) => {
    setRows((prev) => sortTerritories([...prev, territory]));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(territory.id);
      return next;
    });
    setShowNewModal(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async (row: Territory) => {
    if (savingId) return;
    if (!row.name.trim()) {
      showFeedback('error', 'Nome territorio richiesto.');
      return;
    }
    if (row.valid_from && row.valid_to && row.valid_from > row.valid_to) {
      showFeedback('error', `Intervallo non valido per ${row.name}.`);
      return;
    }
    if ((row.lat == null) !== (row.lng == null)) {
      showFeedback('error', `Inserisci sia latitudine sia longitudine per ${row.name}.`);
      return;
    }

    setSavingId(row.id);

    try {
      const response = await fetch('/api/admin/territori', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          name: row.name,
          active: row.active ?? true,
          validFrom: row.valid_from ?? null,
          validTo: row.valid_to ?? null,
          lat: row.lat ?? null,
          lng: row.lng ?? null,
        }),
      });

      const json = await response.json() as { error?: string; territory?: Territory };
      if (!response.ok) {
        throw new Error(json.error ?? 'Errore salvataggio territorio.');
      }

      if (json.territory) {
        updateRow(row.id, json.territory);
      }
      showFeedback('success', `${row.name} aggiornato con successo.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore salvataggio territorio.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: Territory) => {
    if (deletingId) return;
    if (!window.confirm(`Confermi l'eliminazione del territorio ${row.name}?`)) return;

    setDeletingId(row.id);

    try {
      const response = await fetch(`/api/admin/territori?id=${row.id}`, {
        method: 'DELETE',
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? 'Errore eliminazione territorio.');
      }

      setRows((prev) => prev.filter((territory) => territory.id !== row.id));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      showFeedback('success', `${row.name} eliminato.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore eliminazione territorio.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Territori</h1>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
            Gestisci territori, validita temporale e coordinate usate da cronoprogramma e mappa.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] px-5 py-3 text-sm font-semibold text-[var(--success)] shadow-sm transition hover:border-[var(--success)] hover:bg-[var(--success-soft)]"
        >
          <span className="text-lg leading-none">+</span>
          Nuovo Territorio
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Totali</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Validi oggi</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.valid}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Attivi</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.active}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Con coordinate</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.withCoords}</div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[250px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Cerca territorio
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome territorio..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setValidityFilter('all')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                validityFilter === 'all'
                  ? 'bg-[var(--brand-primary)] text-[var(--on-primary)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
              }`}
            >
              Tutti
            </button>
            <button
              onClick={() => setValidityFilter('valid')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                validityFilter === 'valid'
                  ? 'bg-[var(--success)] text-[var(--brand-bg)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--success-soft)]'
              }`}
            >
              Validi
            </button>
            <button
              onClick={() => setValidityFilter('invalid')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                validityFilter === 'invalid'
                  ? 'bg-[var(--warning)] text-[var(--brand-bg)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--warning-soft)]'
              }`}
            >
              Fuori validita
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActivityFilter('all')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                activityFilter === 'all'
                  ? 'bg-[var(--brand-primary)] text-[var(--on-primary)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
              }`}
            >
              Tutti gli stati
            </button>
            <button
              onClick={() => setActivityFilter('active')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                activityFilter === 'active'
                  ? 'bg-[var(--info)] text-[var(--brand-bg)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--info-soft)]'
              }`}
            >
              Attivi
            </button>
            <button
              onClick={() => setActivityFilter('inactive')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                activityFilter === 'inactive'
                  ? 'bg-[var(--brand-text-muted)] text-[var(--brand-bg)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]'
              }`}
            >
              Disattivi
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            feedback.type === 'success'
              ? 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-4">
        {filteredRows.map((row) => {
          const saving = savingId === row.id;
          const deleting = deletingId === row.id;
          const isExpanded = expandedIds.has(row.id);
          const status = territoryStatus(row, today);
          const hasCoords = row.lat != null && row.lng != null;

          return (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleExpand(row.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-[var(--brand-text-main)]">
                    {row.name}
                  </span>
                  <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-2 py-0.5 text-xs text-[var(--brand-primary)]">
                    {status}
                  </span>
                  <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                    {row.active === false ? 'Disattivo' : 'Attivo'}
                  </span>
                  <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                    {hasCoords ? 'Mappa OK' : 'Senza coords'}
                  </span>
                </div>
                <span className="text-sm text-[var(--brand-text-muted)]">
                  {isExpanded ? '^' : 'v'}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--brand-border)] px-5 pb-5 pt-4">
                  <div className="mb-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={deleting || saving}
                      onClick={() => void handleDelete(row)}
                      className="rounded-lg border border-[var(--danger)] px-4 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
                    >
                      {deleting ? 'Eliminazione...' : 'Elimina'}
                    </button>
                    <button
                      type="button"
                      disabled={saving || deleting}
                      onClick={() => void handleSave(row)}
                      className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
                    >
                      {saving ? 'Salvataggio...' : 'Salva'}
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Nome territorio
                      </label>
                      <input
                        value={row.name}
                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        placeholder="Nome territorio"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Valido dal
                      </label>
                      <input
                        type="date"
                        value={row.valid_from ?? ''}
                        onChange={(event) => updateRow(row.id, { valid_from: event.target.value || null })}
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Valido fino al
                      </label>
                      <input
                        type="date"
                        value={row.valid_to ?? ''}
                        onChange={(event) => updateRow(row.id, { valid_to: event.target.value || null })}
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[220px_220px_auto]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Latitudine
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={row.lat ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateRow(row.id, { lat: value === '' ? null : Number(value) });
                        }}
                        placeholder="Es. 43.1107"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Longitudine
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={row.lng ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateRow(row.id, { lng: value === '' ? null : Number(value) });
                        }}
                        placeholder="Es. 12.3908"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <label className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.active !== false}
                        onChange={(event) => updateRow(row.id, { active: event.target.checked })}
                        className="h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      Territorio attivo
                    </label>
                  </div>

                  <div className="mt-3 space-y-0.5 text-xs text-[var(--brand-text-muted)]">
                    <div>
                      <span className="font-semibold">Coordinate: </span>
                      {hasCoords ? `${row.lat!.toFixed(5)}, ${row.lng!.toFixed(5)}` : 'Non impostate'}
                    </div>
                    <div>
                      <span className="font-semibold">Creato il: </span>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : 'Non disponibile'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Nessun territorio trovato.
          </div>
        )}
      </div>

      {showNewModal && (
        <NewTerritoryModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleTerritoryCreated}
        />
      )}
    </div>
  );
}

