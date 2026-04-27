'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ActivityUsage = {
  assignments: number;
  sopralluoghiDataset: number;
  sopralluoghiPdf: number;
  total: number;
};

type ActivityRow = {
  id: string;
  name: string;
  active: boolean | null;
  created_at: string | null;
  usage: ActivityUsage;
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

function sortActivities(rows: ActivityRow[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
}

function activityStatus(row: ActivityRow) {
  return row.active === false ? 'Disattiva' : 'Attiva';
}

function usageLabel(usage: ActivityUsage) {
  if (usage.total === 0) return 'Non utilizzata';
  return `${usage.total.toLocaleString('it-IT')} collegamenti`;
}

export default function GruppoAttivitaClient() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const showFeedback = useCallback((type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3500);
  }, []);

  useEffect(() => {
    let alive = true;

    const loadRows = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/attivita', { cache: 'no-store' });
        const json = await response.json() as { error?: string; activities?: ActivityRow[] };
        if (!response.ok) throw new Error(json.error ?? 'Errore caricamento attivita.');
        if (alive) setRows(sortActivities(json.activities ?? []));
      } catch (err) {
        if (alive) {
          showFeedback('error', err instanceof Error ? err.message : 'Errore caricamento attivita.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadRows();
    return () => {
      alive = false;
    };
  }, [showFeedback]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.active !== false).length;
    const used = rows.filter((row) => row.usage.total > 0).length;
    return {
      total: rows.length,
      active,
      inactive: rows.length - active,
      used,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('it-IT');
    let filtered = rows;

    if (term) {
      filtered = filtered.filter((row) => row.name.toLocaleLowerCase('it-IT').includes(term));
    }

    if (statusFilter === 'active') {
      filtered = filtered.filter((row) => row.active !== false);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter((row) => row.active === false);
    }

    return filtered;
  }, [query, rows, statusFilter]);

  const updateRow = (id: string, patch: Partial<ActivityRow>) => {
    setRows((prev) => sortActivities(prev.map((row) => (row.id === id ? { ...row, ...patch } : row))));
  };

  const replaceRow = (activity: ActivityRow) => {
    setRows((prev) => sortActivities(prev.map((row) => (row.id === activity.id ? activity : row))));
  };

  const handleCreate = async () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name || creating) return;

    setCreating(true);
    try {
      const response = await fetch('/api/admin/attivita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, active: true }),
      });
      const json = await response.json() as { error?: string; activity?: ActivityRow };
      if (!response.ok) throw new Error(json.error ?? 'Errore creazione attivita.');
      if (json.activity) setRows((prev) => sortActivities([...prev, json.activity!]));
      setNewName('');
      showFeedback('success', `${name} aggiunta al gruppo attivita.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore creazione attivita.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (row: ActivityRow) => {
    const name = row.name.trim().replace(/\s+/g, ' ');
    if (!name || savingId) {
      if (!name) showFeedback('error', 'Nome attivita richiesto.');
      return;
    }

    setSavingId(row.id);
    try {
      const response = await fetch('/api/admin/attivita', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          name,
          active: row.active !== false,
        }),
      });
      const json = await response.json() as { error?: string; activity?: ActivityRow };
      if (!response.ok) throw new Error(json.error ?? 'Errore salvataggio attivita.');
      if (json.activity) replaceRow(json.activity);
      showFeedback('success', `${name} aggiornata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore salvataggio attivita.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: ActivityRow) => {
    if (deletingId) return;
    if (!window.confirm(`Confermi l'eliminazione di ${row.name}?`)) return;

    setDeletingId(row.id);
    try {
      const response = await fetch(`/api/admin/attivita?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) throw new Error(json.error ?? 'Errore eliminazione attivita.');
      setRows((prev) => prev.filter((activity) => activity.id !== row.id));
      showFeedback('success', `${row.name} eliminata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore eliminazione attivita.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Gruppo Attivita</h1>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
            Gestisci le attivita condivise da cronoprogramma, mappa e sopralluoghi.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Totali</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Attive</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.active}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Disattive</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.inactive}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">In uso</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.used}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--brand-text-main)]">Nuova attivita</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate();
            }}
            placeholder="Nome attivita"
            className="min-w-[240px] flex-1 rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!newName.trim() || creating}
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
          >
            {creating ? 'Aggiunta...' : 'Aggiungi'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[250px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Cerca attivita
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome attivita..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'border border-[var(--brand-border)] bg-white text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
              }`}
            >
              Tutte
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                statusFilter === 'active'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'border border-[var(--brand-border)] bg-white text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
              }`}
            >
              Attive
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                statusFilter === 'inactive'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'border border-[var(--brand-border)] bg-white text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
              }`}
            >
              Disattive
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            feedback.type === 'success'
              ? 'border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 text-[var(--brand-text-main)]'
              : 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-4">
        {loading && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Caricamento attivita...
          </div>
        )}

        {!loading && filteredRows.map((row) => {
          const saving = savingId === row.id;
          const deleting = deletingId === row.id;
          const canDelete = row.usage.total === 0;

          return (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_260px]">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    Nome attivita
                  </label>
                  <input
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <label className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={row.active !== false}
                    onChange={(event) => updateRow(row.id, { active: event.target.checked })}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                  {activityStatus(row)}
                </label>

                <div className="flex items-end justify-start gap-2 lg:justify-end">
                  <button
                    type="button"
                    disabled={deleting || saving || !canDelete}
                    onClick={() => void handleDelete(row)}
                    className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)] disabled:opacity-50"
                  >
                    {deleting ? 'Eliminazione...' : 'Elimina'}
                  </button>
                  <button
                    type="button"
                    disabled={saving || deleting}
                    onClick={() => void handleSave(row)}
                    className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
                  >
                    {saving ? 'Salvataggio...' : 'Salva'}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-2 py-0.5 text-[var(--brand-primary)]">
                  {activityStatus(row)}
                </span>
                <span className="rounded-full border border-[var(--brand-border)] bg-white px-2 py-0.5 text-[var(--brand-text-muted)]">
                  {usageLabel(row.usage)}
                </span>
                <span className="rounded-full border border-[var(--brand-border)] bg-white px-2 py-0.5 text-[var(--brand-text-muted)]">
                  Cronoprogramma: {row.usage.assignments.toLocaleString('it-IT')}
                </span>
                <span className="rounded-full border border-[var(--brand-border)] bg-white px-2 py-0.5 text-[var(--brand-text-muted)]">
                  Sopralluoghi dati: {row.usage.sopralluoghiDataset.toLocaleString('it-IT')}
                </span>
                <span className="rounded-full border border-[var(--brand-border)] bg-white px-2 py-0.5 text-[var(--brand-text-muted)]">
                  PDF: {row.usage.sopralluoghiPdf.toLocaleString('it-IT')}
                </span>
              </div>
            </div>
          );
        })}

        {!loading && filteredRows.length === 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Nessuna attivita trovata.
          </div>
        )}
      </div>
    </div>
  );
}
