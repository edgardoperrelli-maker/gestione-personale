'use client';
import { useCallback, useEffect, useState } from 'react';
import type { MisuratoreRimosso, StatoMisuratore } from '@/types/misuratori';
import { STATI_MISURATORE, STATO_LABEL } from '@/types/misuratori';
import MisuratoriTabella from './MisuratoriTabella';
import { exportMisuratoriPdf, type PdfFilters } from './exportMisuratoriPdf';

interface Filters {
  dataInizio: string;
  dataFine: string;
  stato: string;
  comune: string;
  esecutore: string;
}

const FILTERS_EMPTY: Filters = {
  dataInizio: '',
  dataFine: '',
  stato: '',
  comune: '',
  esecutore: '',
};

export default function MisuratoriClient() {
  const [rows, setRows]         = useState<MisuratoreRimosso[]>([]);
  const [filters, setFilters]   = useState<Filters>(FILTERS_EMPTY);
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Esecutori e comuni univoci per le select dinamiche
  const esecutori = [...new Set(rows.map(r => r.esecutore).filter(Boolean))] as string[];
  const comuni    = [...new Set(rows.map(r => r.comune).filter(Boolean))] as string[];

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f.dataInizio) params.set('data_inizio', f.dataInizio);
      if (f.dataFine)   params.set('data_fine', f.dataFine);
      if (f.stato)      params.set('stato', f.stato);
      if (f.comune)     params.set('comune', f.comune);
      if (f.esecutore)  params.set('esecutore', f.esecutore);

      const res = await fetch(`/api/misuratori?${params}`);
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Errore fetch');
      setRows(await res.json() as MisuratoreRimosso[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(filters); }, [fetchData, filters]);

  const handlePatch = useCallback(
    async (id: string, patch: { stato?: StatoMisuratore; note?: string }) => {
      // Ottimistic update
      setRows(prev =>
        prev.map(r => r.id === id ? { ...r, ...patch } : r)
      );
      try {
        const res = await fetch(`/api/misuratori/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          // Rollback: ricarica dati
          await fetchData(filters);
        }
      } catch {
        await fetchData(filters);
      }
    },
    [fetchData, filters]
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/misuratori/sync', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; inseriti?: number; rimossi?: number; error?: string };
      if (json.ok) {
        await fetchData(filters);
        const inseriti = json.inseriti ?? 0;
        const rimossi  = json.rimossi  ?? 0;
        if (inseriti > 0 || rimossi > 0) {
          const parti: string[] = [];
          if (inseriti > 0) parti.push(`${inseriti} aggiunti`);
          if (rimossi > 0)  parti.push(`${rimossi} rimossi (non più validi)`);
          alert(`Ricalcolo completato: ${parti.join(', ')}.`);
        } else {
          alert('Nessuna modifica: registro già allineato.');
        }
      } else {
        alert(`Errore sync: ${json.error}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [fetchData, filters]);

  const handleExportPdf = useCallback(() => {
    const pdfFilters: PdfFilters = {
      dataInizio: filters.dataInizio || undefined,
      dataFine:   filters.dataFine   || undefined,
      stato:      filters.stato      || undefined,
      comune:     filters.comune     || undefined,
      esecutore:  filters.esecutore  || undefined,
    };
    exportMisuratoriPdf(rows, pdfFilters);
  }, [rows, filters]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--brand-text-main)]">
          Misuratori Rimossi
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-xs text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] transition-colors disabled:opacity-50"
          >
            {syncing ? 'Sincronizzando…' : 'Ricalcola'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={rows.length === 0}
            className="rounded-lg bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Esporta PDF
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Dal</label>
          <input
            type="date"
            value={filters.dataInizio}
            onChange={e => setFilter('dataInizio', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Al</label>
          <input
            type="date"
            value={filters.dataFine}
            onChange={e => setFilter('dataFine', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Stato</label>
          <select
            value={filters.stato}
            onChange={e => setFilter('stato', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          >
            <option value="">Tutti</option>
            {STATI_MISURATORE.map(s => (
              <option key={s} value={s}>{STATO_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Comune</label>
          <select
            value={filters.comune}
            onChange={e => setFilter('comune', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          >
            <option value="">Tutti</option>
            {comuni.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--brand-text-muted)]">Esecutore</label>
          <select
            value={filters.esecutore}
            onChange={e => setFilter('esecutore', e.target.value)}
            className="rounded border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-1 text-sm"
          >
            <option value="">Tutti</option>
            {esecutori.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {/* Stato caricamento / errore */}
      {loading && (
        <p className="text-sm text-[var(--brand-text-muted)]">Caricamento…</p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Conteggio + Tabella */}
      {!loading && (
        <>
          <p className="text-xs text-[var(--brand-text-muted)]">
            {rows.length} {rows.length === 1 ? 'misuratore' : 'misuratori'}
          </p>
          <MisuratoriTabella rows={rows} onPatch={handlePatch} />
        </>
      )}
    </div>
  );
}
