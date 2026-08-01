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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, FileDown, Loader2, Package, RefreshCw, X } from 'lucide-react';
import type { MisuratoreRimosso, StatoMisuratore } from '@/types/misuratori';
import { STATI_MISURATORE, STATO_LABEL } from '@/types/misuratori';
import { SENZA_PALLET, filtraPerPallet, valoriPallet } from '@/lib/misuratori/pallet';
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
  /**
   * Pallet di riferimento (solo AcquaLatina): a CESTA PIENA si selezionano i misuratori che ci
   * sono finiti dentro e si assegna loro il numero del pallet, in blocco. Porta con sé la
   * colonna in tabella, il filtro e la colonna nel PDF (la distinta del pallet).
   */
  mostraPallet?: boolean;
  /** Titolo del PDF esportato. Assente = quello storico del registro ACEA. */
  titoloPdf?: string;
  /**
   * Breadcrumb di rientro, montato SOPRA la testa (DESIGN.md §7bis: le viste-foglietta hanno
   * la via del ritorno). Sta qui dentro e non nella pagina che lo passa perché la radice è
   * `h-[calc(100dvh-6rem)]`: una riga aggiunta FUORI dal riquadro sfonda la viewport e la
   * pagina scorre, una riga dentro la catena flex viene assorbita dalla tabella, che è
   * `flex-1` e cede i suoi ~28px senza muovere nient'altro.
   */
  breadcrumb?: ReactNode;
};

export default function MisuratoriClient({
  isAdminPlus,
  apiBase = '/api/misuratori',
  titolo = 'Misuratori Rimossi',
  sottotitolo = 'Riconsegna dei misuratori rimossi, dal deposito al committente',
  mostraRicalcola = true,
  mostraPdr = true,
  mostraPallet = false,
  titoloPdf,
  breadcrumb,
}: RegistroProps) {
  const [rows, setRows]               = useState<MisuratoreRimosso[]>([]);
  const [filters, setFilters]         = useState<Filters>(FILTERS_EMPTY);
  const [statoFiltro, setStatoFiltro] = useState<StatoMisuratore | ''>('');
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  /** Filtro rapido per pallet, client-side come quello di stato. '' = tutti. */
  const [palletFiltro, setPalletFiltro] = useState('');
  /** I misuratori spuntati: la cesta che si sta impallettando. */
  const [selezione, setSelezione]     = useState<Set<string>>(new Set());
  /** Numero di pallet da assegnare alla selezione. */
  const [palletInput, setPalletInput] = useState('');
  const [assegnando, setAssegnando]   = useState(false);

  // Esecutori e comuni univoci per le select dinamiche
  const esecutori = [...new Set(rows.map(r => r.esecutore).filter(Boolean))] as string[];
  const comuni    = [...new Set(rows.map(r => r.comune).filter(Boolean))] as string[];

  // Contatori per stato (sull'intero set caricato) + totale.
  const counts = useMemo(() => {
    const byStato = Object.fromEntries(STATI_MISURATORE.map(s => [s, 0])) as Record<StatoMisuratore, number>;
    for (const r of rows) if (r.stato in byStato) byStato[r.stato] += 1;
    return { total: rows.length, byStato };
  }, [rows]);

  // Righe visibili: filtro rapido di stato + filtro pallet, entrambi client-side.
  const visibleRows = useMemo(() => {
    const perStato = statoFiltro ? rows.filter(r => r.stato === statoFiltro) : rows;
    return mostraPallet ? filtraPerPallet(perStato, palletFiltro) : perStato;
  }, [rows, statoFiltro, mostraPallet, palletFiltro]);

  /** I pallet già assegnati, per la tendina del filtro. */
  const pallets = useMemo(() => (mostraPallet ? valoriPallet(rows) : []), [mostraPallet, rows]);

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

  /**
   * Assegna (o toglie, con valore nullo) il pallet ai misuratori spuntati: il gesto «cesta
   * piena». Ottimistico come il resto del registro; la selezione si svuota a scrittura riuscita
   * — la cesta è andata sul pallet, la prossima riparte vuota.
   */
  const handleAssegnaPallet = useCallback(async (valore: string | null) => {
    const ids = [...selezione];
    if (ids.length === 0) return;
    const pallet = valore?.trim() || null;
    setAssegnando(true);
    const prima = rows;
    setRows(prev => prev.map(r => (selezione.has(r.id) ? { ...r, pallet } : r)));
    try {
      const res = await fetch(`${apiBase}/pallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, pallet }),
      });
      const json = await res.json().catch(() => ({})) as { aggiornati?: number; error?: string };
      if (!res.ok) {
        setRows(prima);
        toast.error(json.error ?? 'Assegnazione pallet non riuscita.');
        return;
      }
      const n = json.aggiornati ?? ids.length;
      toast.success(pallet
        ? `${n} ${n === 1 ? 'misuratore' : 'misuratori'} sul pallet ${pallet}.`
        : `${n} ${n === 1 ? 'misuratore tolto' : 'misuratori tolti'} dal pallet.`);
      setSelezione(new Set());
      setPalletInput('');
    } catch {
      setRows(prima);
      toast.error('Assegnazione pallet non riuscita.');
    } finally {
      setAssegnando(false);
    }
  }, [apiBase, rows, selezione]);

  const handleExportPdf = useCallback(() => {
    const pdfFilters: PdfFilters = {
      dataInizio: filters.dataInizio || undefined,
      dataFine:   filters.dataFine   || undefined,
      stato:      statoFiltro        || undefined,
      comune:     filters.comune     || undefined,
      esecutore:  filters.esecutore  || undefined,
      pallet:     !mostraPallet || palletFiltro === ''
        ? undefined
        : palletFiltro === SENZA_PALLET ? 'senza pallet' : palletFiltro,
    };
    exportMisuratoriPdf(visibleRows, pdfFilters, { titolo: titoloPdf, mostraPdr, mostraPallet });
  }, [visibleRows, filters, statoFiltro, mostraPallet, palletFiltro, titoloPdf, mostraPdr]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  // Toggle del filtro rapido di stato dalle card.
  const toggleStato = (s: StatoMisuratore | '') =>
    setStatoFiltro(prev => (s === '' ? '' : prev === s ? '' : s));

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-4">
      {/*
        Rientro della vista-foglietta, quando c'è: dentro il riquadro full-screen (vedi la prop).
        `shrink-0` come ogni altro fratello fisso di questa colonna (KPI, filtri, conteggio):
        oggi il minimo automatico flex lo proteggerebbe comunque, ma il contratto qui si
        dichiara, non si eredita per caso — è la stessa forma di StoricoInterventiClient.

        DEROGA DICHIARATA a §7ter (le pagine-foglietta col Breadcrumb stanno sul pattern slim):
        sotto il rientro resta l'ObjectHeader pieno, perché le azioni primarie del registro
        (Ricalcola, Esporta PDF) vivono nelle sue `actions` e §3 vieta le teste su misura.
        Titolo doppio col breadcrumb, ~70px alla tabella: accettato finché il client non
        passa allo slim con le azioni sulla riga del rientro, come lo Storico.
      */}
      {breadcrumb && <div className="shrink-0">{breadcrumb}</div>}
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
        {mostraPallet && (
          <label className="flex w-44 flex-col gap-1">
            <span className="text-xs text-[var(--brand-text-muted)]">Pallet</span>
            {/* «Senza pallet» è la domanda vera a fine giornata: cosa è ancora in cesta. */}
            <Select value={palletFiltro} onChange={e => setPalletFiltro(e.target.value)}>
              <option value="">Tutti</option>
              <option value={SENZA_PALLET}>Senza pallet</option>
              {pallets.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </label>
        )}
      </div>

      {/*
        La barra della CESTA PIENA: compare con la selezione e scrive il pallet in blocco.
        Fissa come i filtri (la tabella scorre sotto): mentre si spuntano trenta righe la barra
        non deve scappare fuori schermo.
      */}
      {mostraPallet && selezione.size > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] px-3 py-2 shadow-[var(--shadow-sm)]">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-text-main)]">
            <Package className="h-4 w-4" aria-hidden />
            {selezione.size} {selezione.size === 1 ? 'misuratore selezionato' : 'misuratori selezionati'}
          </span>
          <label className="flex items-center gap-2">
            <span className="text-xs text-[var(--brand-text-muted)]">Numero pallet</span>
            {/* La larghezza sta sul contenitore: Input porta un `w-full` suo. */}
            <span className="w-28">
              <Input
                value={palletInput}
                onChange={e => setPalletInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && palletInput.trim()) void handleAssegnaPallet(palletInput); }}
                placeholder="es. 3"
                aria-label="Numero del pallet da assegnare alla selezione"
              />
            </span>
          </label>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleAssegnaPallet(palletInput)}
            disabled={!palletInput.trim()}
            loading={assegnando}
          >
            Assegna pallet
          </Button>
          {/* La correzione: la selezione torna «in cesta» (pallet nullo). */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAssegnaPallet(null)}
            loading={assegnando}
            title="Toglie il numero di pallet dai misuratori selezionati"
          >
            Togli dal pallet
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelezione(new Set())}
            disabled={assegnando}
          >
            <X className="h-4 w-4" aria-hidden />
            Annulla selezione
          </Button>
        </div>
      )}

      {/*
        Errore (fisso). Il TESTO va in --brand-text-main e non in --danger: è un banner di
        prosa (il messaggio della fetch fallita), e su un testo lungo il colore serve alla
        leggibilità, non a dire lo stato — DESIGN.md §3 marca proprio questa come «la scelta
        che sbaglia più spesso». Il rosso resta a bordo e icona, che lo stato lo dicono già.
      */}
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--brand-text-main)]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
          {error}
        </div>
      )}

      {/* Conteggio (fisso) */}
      <p className="shrink-0 text-xs text-[var(--brand-text-muted)]">
        {statoFiltro
          ? `${visibleRows.length} di ${counts.total} (${STATO_LABEL[statoFiltro]})`
          : `${counts.total} ${counts.total === 1 ? 'misuratore' : 'misuratori'}`}
      </p>

      {/*
        Regione live per i lettori di schermo, montata SEMPRE (una regione inserita insieme al
        testo spesso non viene annunciata): dice il caricamento in corso e, a fetch concluso,
        il conteggio — a chi vede, le stesse cose le dicono l'overlay e la riga qui sopra.
      */}
      <p role="status" className="sr-only">
        {loading ? 'Caricamento del registro…' : `${counts.total} misuratori nel registro.`}
      </p>

      {/* Area tabella: UNICA parte che scorre */}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" aria-hidden />
            Caricamento…
          </div>
        )}
        <MisuratoriTabella
          rows={visibleRows}
          onPatch={handlePatch}
          isAdminPlus={isAdminPlus}
          mostraPdr={mostraPdr}
          mostraPallet={mostraPallet}
          selezione={mostraPallet ? selezione : undefined}
          onSelezione={mostraPallet ? setSelezione : undefined}
        />
      </div>
    </div>
  );
}
