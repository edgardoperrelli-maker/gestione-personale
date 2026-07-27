'use client';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench
 * design-system: DESIGN.md (Cockpit) · designed-as-app · pre-emit critique: P5 H4 E5 S4 R5 V4
 *
 * Allineamento Cockpit del modulo Misuratori (registro rimozioni + riconsegna al committente):
 * testa → ObjectHeader, azioni → primitivo Button (primario esplicito), filtri → Input/Select,
 * stati misuratore su token semantici (status-idle/warn/progress/ok, viola), niente hex/neon, banner errore tokenizzato,
 * tabella su superficie bianca con header muted sticky. Logica, fetch, ottimistica e
 * flusso di riconsegna invariati.
 */
import { toast } from '@/components/ui/Toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileDown, Loader2, RefreshCw } from 'lucide-react';
import type { MisuratoreRimosso, StatoMisuratore } from '@/types/misuratori';
import { STATI_MISURATORE, STATO_LABEL } from '@/types/misuratori';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import ObjectHeader from '@/components/ui/ObjectHeader';
import MisuratoriTabella from './MisuratoriTabella';
import { STATO_ACCENT } from './StatoBadge';
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

/** Il registro è lo stesso codice per ACEA e AcquaLatina: cambiano l'endpoint (le due
 *  tabelle sono separate) e le funzioni che solo ACEA ha (il ricalcolo dalla
 *  consuntivazione, la colonna PDR). Gli stati logistici sono invece identici. */
export type RegistroProps = {
  isAdminPlus: boolean;
  /** Base REST del registro. Default: il registro ACEA. */
  apiBase?: string;
  titolo?: string;
  sottotitolo?: string;
  /** Ricalcolo dalla consuntivazione: esiste solo per ACEA. */
  mostraRicalcola?: boolean;
  /** Colonna PDR: un misuratore d'acqua non ha un punto di riconsegna gas. */
  mostraPdr?: boolean;
};

export default function MisuratoriClient({
  isAdminPlus,
  apiBase = '/api/misuratori',
  titolo = 'Misuratori Rimossi',
  sottotitolo = 'Riconsegna dei misuratori rimossi, dal deposito al committente',
  mostraRicalcola = true,
  mostraPdr = true,
}: RegistroProps) {
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

      const res = await fetch(`${apiBase}?${params}`);
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Errore fetch');
      setRows(await res.json() as MisuratoreRimosso[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchData(filters); }, [fetchData, filters]);

  const handlePatch = useCallback(
    async (id: string, patch: { stato?: StatoMisuratore; note?: string }) => {
      // Ottimistic update
      setRows(prev =>
        prev.map(r => r.id === id ? { ...r, ...patch } : r)
      );
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          // Rollback: ricarica dati + mostra il motivo (es. 403 regressione vietata)
          const msg = (await res.json().catch(() => ({})) as { error?: string }).error;
          await fetchData(filters);
          if (msg) toast.info(msg);
        }
      } catch {
        await fetchData(filters);
      }
    },
    [apiBase, fetchData, filters]
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${apiBase}/sync`, { method: 'POST' });
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
          toast.success(`Ricalcolo completato: ${parti.join(', ')}.`);
        } else {
          toast.info('Nessuna modifica: registro già allineato.');
        }
      } else {
        toast.error(`Errore sync: ${json.error}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [apiBase, fetchData, filters]);

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
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-4">
      {/* Testa di modulo (fissa) */}
      <ObjectHeader
        title={titolo}
        sub={sottotitolo}
        actions={
          <>
            {mostraRicalcola && (
              <Button variant="outline" size="sm" onClick={handleSync} loading={syncing}>
                {!syncing && <RefreshCw className="h-4 w-4" aria-hidden />}
                {syncing ? 'Ricalcolo…' : 'Ricalcola'}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportPdf}
              disabled={visibleRows.length === 0}
            >
              <FileDown className="h-4 w-4" aria-hidden />
              Esporta PDF
            </Button>
          </>
        }
      />

      {/* Card-contatore = filtri rapidi per stato (fisse) */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Tutti */}
        <button
          type="button"
          onClick={() => toggleStato('')}
          aria-pressed={statoFiltro === ''}
          className={`relative flex flex-col items-start overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--brand-surface)] px-3.5 py-2 text-left shadow-[var(--shadow-sm)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
            statoFiltro === ''
              ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]'
              : 'border-[var(--brand-border)] hover:border-[var(--brand-text-muted)]'
          }`}
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-[var(--brand-primary)]" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--brand-text-muted)]">Tutti</span>
          <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--brand-primary)]">
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
              className={`relative flex flex-col items-start overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--brand-surface)] px-3.5 py-2 text-left shadow-[var(--shadow-sm)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                active ? '' : 'border-[var(--brand-border)] hover:border-[var(--brand-text-muted)]'
              }`}
              style={active ? { borderColor: accent, boxShadow: `var(--shadow-sm), 0 0 0 1px ${accent}` } : undefined}
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} aria-hidden />
              <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--brand-text-muted)]">{STATO_LABEL[s]}</span>
              <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color: accent }}>
                {counts.byStato[s].toLocaleString('it-IT')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filtri (fissi) */}
      <div className="flex shrink-0 flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 shadow-[var(--shadow-sm)]">
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs text-[var(--brand-text-muted)]">Dal</span>
          <Input type="date" value={filters.dataInizio} onChange={e => setFilter('dataInizio', e.target.value)} />
        </label>
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs text-[var(--brand-text-muted)]">Al</span>
          <Input type="date" value={filters.dataFine} onChange={e => setFilter('dataFine', e.target.value)} />
        </label>
        <label className="flex w-48 flex-col gap-1">
          <span className="text-xs text-[var(--brand-text-muted)]">Comune</span>
          <Select value={filters.comune} onChange={e => setFilter('comune', e.target.value)}>
            <option value="">Tutti</option>
            {comuni.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </label>
        <label className="flex w-48 flex-col gap-1">
          <span className="text-xs text-[var(--brand-text-muted)]">Esecutore</span>
          <Select value={filters.esecutore} onChange={e => setFilter('esecutore', e.target.value)}>
            <option value="">Tutti</option>
            {esecutori.map(e => <option key={e} value={e}>{e}</option>)}
          </Select>
        </label>
      </div>

      {/* Errore (fisso) */}
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {/* Conteggio (fisso) */}
      <p className="shrink-0 text-xs text-[var(--brand-text-muted)]">
        {statoFiltro
          ? `${visibleRows.length} di ${counts.total} (${STATO_LABEL[statoFiltro]})`
          : `${counts.total} ${counts.total === 1 ? 'misuratore' : 'misuratori'}`}
      </p>

      {/* Area tabella: UNICA parte che scorre */}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" aria-hidden />
            Caricamento…
          </div>
        )}
        <MisuratoriTabella rows={visibleRows} onPatch={handlePatch} isAdminPlus={isAdminPlus} mostraPdr={mostraPdr} />
      </div>
    </div>
  );
}
