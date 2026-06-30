'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MisuratoreRimosso, StatoMisuratore } from '@/types/misuratori';
import { STATI_MISURATORE, STATO_LABEL } from '@/types/misuratori';
import MisuratoriTabella from './MisuratoriTabella';
import { exportMisuratoriPdf, type PdfFilters } from './exportMisuratoriPdf';

/** Filtri lato server (la data/comune/esecutore rifanno la fetch). Lo stato è un
 *  filtro rapido CLIENT-side, pilotato dalle card, così i contatori delle card
 *  restano sempre completi (mostrano la ripartizione di TUTTI gli stati). */
interface Filters {
  dataInizio: string;
  dataFine: string;
  comune: string;
  esecutore: string;
}

const FILTERS_EMPTY: Filters = {
  dataInizio: '',
  dataFine: '',
  comune: '',
  esecutore: '',
};

/** Accento colore per ogni stato (card-contatore + valore). */
const STATO_ACCENT: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:  '#94a3b8', // slate
  scaricato_deposito:      '#fb923c', // arancione neon
  verificato_deposito:     '#a78bfa', // violetto neon
  in_consegna_committente: '#38bdf8', // blu neon (sky)
  consegnato_committente:  '#22c55e', // verde neon
};

export default function MisuratoriClient({ isAdminPlus }: { isAdminPlus: boolean }) {
  const [rows, setRows]               = useState<MisuratoreRimosso[]>([]);
  const [filters, setFilters]         = useState<Filters>(FILTERS_EMPTY);
  const [statoFiltro, setStatoFiltro] = useState<StatoMisuratore | ''>('');
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Esecutori e comuni univoci per le select dinamiche
  const esecutori = [...new Set(rows.map(r => r.esecutore).filter(Boolean))] as string[];
  const comuni    = [...new Set(rows.map(r => r.comune).filter(Boolean))] as string[];

  // Contatori per stato (sull'intero set caricato) + totale.
  const counts = useMemo(() => {
    const byStato = Object.fromEntries(STATI_MISURATORE.map(s => [s, 0])) as Record<StatoMisuratore, number>;
    for (const r of rows) if (r.stato in byStato) byStato[r.stato] += 1;
    return { total: rows.length, byStato };
  }, [rows]);

  // Righe visibili: applica il filtro rapido di stato (client-side).
  const visibleRows = useMemo(
    () => (statoFiltro ? rows.filter(r => r.stato === statoFiltro) : rows),
    [rows, statoFiltro],
  );

  const fetchData = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f.dataInizio) params.set('data_inizio', f.dataInizio);
      if (f.dataFine)   params.set('data_fine', f.dataFine);
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
          // Rollback: ricarica dati + mostra il motivo (es. 403 regressione vietata)
          const msg = (await res.json().catch(() => ({})) as { error?: string }).error;
          await fetchData(filters);
          if (msg) alert(msg);
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
      const json = await res.json() as { ok?: boolean; inseriti?: number; rimossi?: number; aggiornati?: number; error?: string };
      if (json.ok) {
        await fetchData(filters);
        const inseriti   = json.inseriti   ?? 0;
        const rimossi    = json.rimossi    ?? 0;
        const aggiornati = json.aggiornati ?? 0;
        if (inseriti > 0 || rimossi > 0 || aggiornati > 0) {
          const parti: string[] = [];
          if (inseriti > 0)   parti.push(`${inseriti} aggiunti`);
          if (rimossi > 0)    parti.push(`${rimossi} rimossi (non più validi)`);
          if (aggiornati > 0) parti.push(`${aggiornati} date corrette`);
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
      stato:      statoFiltro        || undefined,
      comune:     filters.comune     || undefined,
      esecutore:  filters.esecutore  || undefined,
    };
    exportMisuratoriPdf(visibleRows, pdfFilters);
  }, [visibleRows, filters, statoFiltro]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  // Toggle del filtro rapido di stato dalle card.
  const toggleStato = (s: StatoMisuratore | '') =>
    setStatoFiltro(prev => (s === '' ? '' : prev === s ? '' : s));

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-4">
      {/* Header (fisso) */}
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
            disabled={visibleRows.length === 0}
            className="rounded-lg bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Esporta PDF
          </button>
        </div>
      </div>

      {/* Card-contatore = filtri rapidi per stato (fisse) */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Tutti */}
        <button
          type="button"
          onClick={() => toggleStato('')}
          aria-pressed={statoFiltro === ''}
          className={`flex flex-col items-start rounded-xl border bg-[var(--brand-surface)] px-3 py-2 text-left transition-colors ${
            statoFiltro === ''
              ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]'
              : 'border-[var(--brand-border)] hover:border-[var(--brand-text-muted)]'
          }`}
        >
          <span className="text-xs text-[var(--brand-text-muted)]">Tutti</span>
          <span className="text-2xl font-semibold text-[var(--brand-primary)]">
            {counts.total.toLocaleString('it-IT')}
          </span>
        </button>

        {/* Una card per stato */}
        {STATI_MISURATORE.map(s => {
          const active = statoFiltro === s;
          const accent = STATO_ACCENT[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStato(s)}
              aria-pressed={active}
              title={`Filtra: ${STATO_LABEL[s]}`}
              className={`flex flex-col items-start rounded-xl border bg-[var(--brand-surface)] px-3 py-2 text-left transition-colors ${
                active ? 'ring-1' : 'border-[var(--brand-border)] hover:border-[var(--brand-text-muted)]'
              }`}
              style={active ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}
            >
              <span className="truncate text-xs text-[var(--brand-text-muted)]">{STATO_LABEL[s]}</span>
              <span className="text-2xl font-semibold" style={{ color: accent }}>
                {counts.byStato[s].toLocaleString('it-IT')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filtri (fissi) */}
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

      {/* Errore (fisso) */}
      {error && (
        <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Conteggio (fisso) */}
      <p className="shrink-0 text-xs text-[var(--brand-text-muted)]">
        {statoFiltro
          ? `${visibleRows.length} di ${counts.total} (${STATO_LABEL[statoFiltro]})`
          : `${counts.total} ${counts.total === 1 ? 'misuratore' : 'misuratori'}`}
      </p>

      {/* Area tabella: UNICA parte che scorre */}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)]">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
            Caricamento…
          </div>
        )}
        <MisuratoriTabella rows={visibleRows} onPatch={handlePatch} isAdminPlus={isAdminPlus} />
      </div>
    </div>
  );
}
