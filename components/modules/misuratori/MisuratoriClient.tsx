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
import { chiediConferma } from '@/components/ui/chiediConferma';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, FileDown, Loader2, Package, RefreshCw, X } from 'lucide-react';
import type { MisuratoreRimosso, StatoMisuratore } from '@/types/misuratori';
import { STATI_MISURATORE, STATO_LABEL } from '@/types/misuratori';
import { SENZA_RIFERIMENTO, filtraPerRiferimento, valoriRiferimento } from '@/lib/misuratori/riferimenti';
import { statoDopoCesta } from '@/lib/misuratori/cestaStato';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import ObjectHeader from '@/components/ui/ObjectHeader';
import MisuratoriTabella from './MisuratoriTabella';
import { STATO_ACCENT } from './StatoBadge';
import { exportMisuratoriPdf, type PdfFilters } from './exportMisuratoriPdf';
import { numeroIt } from '@/utils/numero-it';

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
  /**
   * Ricalcolo del registro dal lavoro chiuso in positivo. Esisteva solo per ACEA; dal
   * 2026-08-03 le due commesse condividono il motore (`lib/misuratori/sincronizzaRegistro`)
   * e il pulsante ha senso su entrambe — è l'unico modo di recuperare il pregresso.
   */
  mostraRicalcola?: boolean;
  /** Colonna PDR: un misuratore d'acqua non ha un punto di riconsegna gas. */
  mostraPdr?: boolean;
  /**
   * Cesta di magazzino — di ENTRAMBE le commesse: è il contenitore numerato con cui la
   * riconsegna al committente viaggia. Su ACEA la scrive l'ufficio (era la colonna «pallet»,
   * rinominata il 2026-08-04 quando i due nomi si sono rivelati la stessa cosa) ed è un
   * riferimento e basta. Su AcquaLatina la dichiara l'OPERATORE all'invio del rapportino, e vale
   * l'**invariante cesta↔stato** (vedi AGENTS.md): anche quando la scrive l'ufficio — in cella o
   * in blocco — scriverla o toglierla muove lo stato. Non è il campo che si corregge senza
   * conseguenze, ed è per questo che il registro racconta a parole quello che il server decide.
   * Porta con sé la colonna in tabella, il filtro («cosa c'è nella cesta 3?»), l'assegnazione
   * in blocco dalla barra della selezione e la colonna nel PDF (la distinta della cesta).
   */
  mostraCesta?: boolean;
  /**
   * L'invariante cesta↔stato (AGENTS.md §13, «AcquaLatina: registro gemello…»): SOLO su
   * AcquaLatina scrivere o togliere la cesta — anche in blocco dalla barra — dichiara lo
   * scarico e muove lo stato. Il flag pilota la conferma preventiva di `handleAssegnaCesta`
   * (`statoDopoCesta` è pura e gira anche lato client). Va dichiarato ESPLICITAMENTE dalla
   * pagina che monta il client: dedurlo da `apiBase` legherebbe due stringhe di endpoint a un
   * contratto che deve restare leggibile a colpo d'occhio.
   */
  cestaDichiaraScarico?: boolean;
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
  titolo = 'Misuratori rimossi',
  sottotitolo = 'Riconsegna dei misuratori rimossi, dal deposito al committente',
  mostraRicalcola = true,
  mostraPdr = true,
  mostraCesta = false,
  cestaDichiaraScarico = false,
  titoloPdf,
  breadcrumb,
}: RegistroProps) {
  const [rows, setRows]               = useState<MisuratoreRimosso[]>([]);
  const [filters, setFilters]         = useState<Filters>(FILTERS_EMPTY);
  const [statoFiltro, setStatoFiltro] = useState<StatoMisuratore | ''>('');
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  /** Filtro rapido per cesta, client-side come quello di stato. '' = tutte. */
  const [cestaFiltro, setCestaFiltro] = useState('');
  /** I misuratori spuntati: quelli a cui si sta scrivendo la stessa cesta. */
  const [selezione, setSelezione]     = useState<Set<string>>(new Set());
  /** Numero di cesta da assegnare alla selezione. */
  const [cestaInput, setCestaInput]   = useState('');
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

  // Righe visibili: filtro rapido di stato + cesta, entrambi client-side.
  const visibleRows = useMemo(() => {
    const perStato = statoFiltro ? rows.filter(r => r.stato === statoFiltro) : rows;
    return mostraCesta ? filtraPerRiferimento(perStato, cestaFiltro) : perStato;
  }, [rows, statoFiltro, mostraCesta, cestaFiltro]);

  /** Le ceste già in uso, per la tendina del filtro. */
  const ceste = useMemo(() => (mostraCesta ? valoriRiferimento(rows) : []), [mostraCesta, rows]);

  /*
    Una fetch alla volta: quella nuova ANNULLA la precedente.

    Senza, due cambi di filtro ravvicinati erano una corsa: la risposta lenta del filtro
    vecchio poteva arrivare DOPO quella del filtro nuovo e sovrascriverla — la tabella
    mostrava i dati di ieri sotto i filtri di oggi, senza nessun segno. L'AbortError non è
    un errore: è la conferma che l'annullamento ha funzionato, e non deve sporcare il banner.
  */
  const fetchInCorso = useRef<AbortController | null>(null);
  const fetchData = useCallback(async (f: Filters) => {
    fetchInCorso.current?.abort();
    const controller = new AbortController();
    fetchInCorso.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f.dataInizio) params.set('data_inizio', f.dataInizio);
      if (f.dataFine)   params.set('data_fine', f.dataFine);
      if (f.comune)     params.set('comune', f.comune);
      if (f.esecutore)  params.set('esecutore', f.esecutore);

      const res = await fetch(`${apiBase}?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Errore fetch');
      setRows(await res.json() as MisuratoreRimosso[]);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      if (fetchInCorso.current === controller) setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchData(filters); }, [fetchData, filters]);

  /*
    Le righe con una PATCH in volo: il loro select si disabilita finché non torna l'esito.

    Senza, due cambi rapidi sulla stessa riga erano due PATCH concorrenti senza ordine
    garantito — A→B e B→C potevano atterrare come C poi B, e l'ottimistica mostrava uno
    stato che il server non aveva. Una scrittura per riga alla volta chiude la corsa
    alla radice, e il costo è mezzo secondo di tendina grigia.
  */
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  /** L'area che scorre: destinazione del focus quando la barra della cesta si smonta. */
  const areaTabella = useRef<HTMLDivElement>(null);

  const handlePatch = useCallback(
    // `cesta` inclusa: si scrive anche una cella alla volta, non solo in blocco dalla barra.
    // Su AcquaLatina la scrive l'operatore allo scarico e qui la si CORREGGE (rapportino chiuso).
    async (id: string, patch: { stato?: StatoMisuratore; note?: string; cesta?: string }) => {
      setSalvando(prev => new Set(prev).add(id));
      // La cesta di PRIMA: serve a non annunciare una rimozione su una riga che non ne aveva
      // una. È il motivo per cui `rows` sta nelle dipendenze qui sotto.
      const cestaPrima = rows.find(r => r.id === id)?.cesta?.trim() || null;
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
          /*
            Rollback PARLANTE, sempre: la riga che torna indietro da sola, senza una parola,
            insegna a non fidarsi del registro. `toast.error` e non `info` — un salvataggio
            rifiutato è un errore anche quando il motivo è legittimo (403 regressione vietata),
            e il fallback copre le risposte senza corpo JSON (proxy, 502).
          */
          const msg = (await res.json().catch(() => ({})) as { error?: string }).error;
          await fetchData(filters);
          toast.error(msg ?? 'Salvataggio rifiutato dal server: la riga è tornata com\'era.');
          return;
        }
        /*
          Il server può aver deciso PIÙ di quello che gli si è chiesto: scrivere la cesta
          dichiara lo scarico, svuotarla lo disfa, e riportare lo stato a «da consegnare» toglie
          la cesta, che a quel punto è un riferimento falso. Quei campi tornano nella risposta e
          si fondono nella riga — senza, la colonna resterebbe quella vecchia a schermo, perché
          il successo di proposito NON rifà la fetch.
        */
        const eco = await res.json().catch(() => ({})) as { stato?: StatoMisuratore; cesta?: string | null };
        const deciso: Partial<MisuratoreRimosso> = {};
        if (eco.stato !== undefined) deciso.stato = eco.stato;
        if (eco.cesta !== undefined) deciso.cesta = eco.cesta;
        if (Object.keys(deciso).length > 0) {
          setRows(prev => prev.map(r => r.id === id ? { ...r, ...deciso } : r));
        }
        /*
          E si dice a parole, che è l'altra metà di «l'effetto non resta nascosto». Niente
          dialogo di conferma: il gesto più frequente è correggere un refuso su una riga già
          scaricata, dove non cambia niente, e nei casi in cui lo stato si muove l'ufficio sta
          facendo proprio quello che intendeva. Il toast scatta SOLO quando il server ha deciso
          da sé: se lo stato l'ha mosso la tendina, annunciarlo sarebbe rumore.
        */
        if (patch.cesta !== undefined && eco.stato === 'scaricato_deposito') {
          toast.success(`Cesta ${patch.cesta.trim()} · il misuratore risulta scaricato a deposito.`);
        } else if (patch.cesta !== undefined && eco.stato === 'da_consegnare_deposito') {
          toast.success('Cesta tolta · il misuratore torna fra quelli da scaricare.');
        } else if (patch.stato !== undefined && eco.cesta === null && cestaPrima) {
          toast.success('Cesta tolta · il misuratore non risulta più in deposito.');
        }
      } catch {
        // Il caso peggiore era QUESTO: rete giù, rollback muto. La riga torna indietro e lo dice.
        await fetchData(filters);
        toast.error('Salvataggio non riuscito (rete): la riga è tornata com\'era.');
      } finally {
        setSalvando(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    },
    [apiBase, fetchData, filters, rows]
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      // `catch` sotto e parse tollerante qui: prima un ricalcolo caduto per rete o per una
      // risposta non-JSON moriva in silenzio — lo spinner si fermava e basta, e chi aveva
      // cliccato restava convinto che il registro fosse stato ricalcolato.
      const res = await fetch(`${apiBase}/sync`, { method: 'POST' });
      const json = await res.json().catch(() => ({})) as { ok?: boolean; inseriti?: number; rimossi?: number; aggiornati?: number; error?: string };
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
        toast.error(`Errore sync: ${json.error ?? 'risposta non valida dal server'}`);
      }
    } catch {
      toast.error('Ricalcolo non riuscito (rete): il registro è rimasto com\'era.');
    } finally {
      setSyncing(false);
    }
  }, [apiBase, fetchData, filters]);

  /**
   * Assegna (o toglie, con valore nullo) la cesta ai misuratori spuntati. Ottimistico come il
   * resto del registro; la selezione si svuota a scrittura riuscita — quella cesta è a posto,
   * la prossima riparte vuota.
   */
  const handleAssegnaCesta = useCallback(async (valore: string | null) => {
    // Il guard di rientro: Invio nell'input non passava da `disabled`, e due Invii rapidi
    // erano due POST in blocco sulla stessa selezione.
    if (assegnando) return;
    const ids = [...selezione];
    if (ids.length === 0) return;
    const cesta = valore?.trim() || null;
    const selezionate = rows.filter((r) => selezione.has(r.id));

    /*
      Sovrascrivere una cesta GIÀ DIVERSA si dichiara, non si fa in silenzio: la spunta di
      testa prende anche le righe che una cesta ce l'hanno — e su AcquaLatina quel numero l'ha
      dichiarato l'OPERATORE avendo i contatori in mano. Un numero scritto sopra un altro è il
      tipo di errore che in deposito si scopre solo contando i contatori.
    */
    const sovrascritti = cesta !== null
      ? selezionate.filter((r) => r.cesta?.trim() && r.cesta.trim() !== cesta)
      : [];

    /*
      Quante righe della selezione cambierebbero stato — SOLO dove vale l'invariante
      (`cestaDichiaraScarico`, acceso solo su AcquaLatina: AGENTS.md §13). La spunta di testa
      prende tutte le righe VISIBILI, non quelle guardate una per una: qui — a differenza della
      cella, dove il gesto è su una riga sola e deliberato, e la spec ha scelto niente dialogo
      (§7) — la barra lo dichiara PRIMA di scriverlo. `statoDopoCesta` è pura: la stessa
      funzione che decide sul server, chiamata qui solo per anticiparne l'esito.
    */
    const daCambiareStato = cestaDichiaraScarico
      ? selezionate.filter((r) => statoDopoCesta(r.stato, cesta) !== null)
      : [];

    // Le due conferme restano UN dialogo solo: se scattano insieme non si mettono in fila due
    // popup per lo stesso click.
    if (sovrascritti.length > 0 || daCambiareStato.length > 0) {
      const direzione = cesta !== null
        ? 'risulteranno scaricati a deposito'
        : 'torneranno fra quelli da scaricare';
      const frasi: string[] = [];
      if (sovrascritti.length > 0) frasi.push(`Il numero verrà sovrascritto con «${cesta}».`);
      if (daCambiareStato.length > 0) {
        frasi.push(
          `${daCambiareStato.length} ${daCambiareStato.length === 1 ? 'misuratore' : 'misuratori'} ${direzione}.`,
        );
      }
      const title = sovrascritti.length > 0
        ? (sovrascritti.length === 1
            ? '1 misuratore selezionato è già in un\'altra cesta'
            : `${sovrascritti.length} misuratori selezionati sono già in un'altra cesta`)
        : (daCambiareStato.length === 1
            ? '1 misuratore selezionato cambierà stato'
            : `${daCambiareStato.length} misuratori selezionati cambieranno stato`);
      const ok = await chiediConferma({
        title,
        message: frasi.join(' '),
        ...(sovrascritti.length > 0 ? { confirmLabel: 'Sovrascrivi' } : {}),
      });
      if (!ok) return;
    }

    setAssegnando(true);
    /*
      Rollback PER RIGA, non per fotografia: `setRows(prima)` ripristinava l'intera tabella,
      e con lei si portava via anche i cambi di stato fatti su ALTRE righe mentre la POST era
      in volo. Si ricordano le sole ceste toccate e si rimettono solo quelle.
    */
    const cestaPrima = new Map(selezionate.map((r) => [r.id, r.cesta]));
    const ripristina = () => setRows(prev => prev.map(
      (r) => (cestaPrima.has(r.id) ? { ...r, cesta: cestaPrima.get(r.id) ?? null } : r),
    ));
    setRows(prev => prev.map(r => (selezione.has(r.id) ? { ...r, cesta } : r)));
    try {
      const res = await fetch(`${apiBase}/cesta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, cesta }),
      });
      const json = await res.json().catch(() => ({})) as { aggiornati?: number; cambiStato?: number; error?: string };
      if (!res.ok) {
        ripristina();
        toast.error(json.error ?? 'Assegnazione cesta non riuscita.');
        return;
      }
      const n = json.aggiornati ?? ids.length;
      const cambiStato = json.cambiStato ?? 0;
      /*
        Stesso pattern di `handleSync`: parti opzionali unite da virgola, un punto in fondo. Su
        ACEA (o quando nessuna riga cambia stato) `parti` ha un elemento solo — il toast resta
        byte per byte quello di sempre.
      */
      const parti = [cesta
        ? `${n} ${n === 1 ? 'misuratore' : 'misuratori'} nella cesta ${cesta}`
        : `${n} ${n === 1 ? 'misuratore tolto' : 'misuratori tolti'} dalla cesta`];
      if (cambiStato > 0) {
        parti.push(`${cambiStato} ${cambiStato === 1 ? 'ha cambiato stato' : 'hanno cambiato stato'}`);
      }
      toast.success(`${parti.join(', ')}.`);
      // Si tolgono dalla selezione le sole righe SCRITTE: una spunta aggiunta durante il volo
      // non c'entra con questa cesta, e azzerarla in blocco la faceva sparire senza motivo.
      setSelezione(prev => new Set([...prev].filter((id) => !cestaPrima.has(id))));
      setCestaInput('');
    } catch {
      ripristina();
      toast.error('Assegnazione cesta non riuscita.');
    } finally {
      setAssegnando(false);
    }
  }, [apiBase, rows, selezione, assegnando, cestaDichiaraScarico]);

  const handleExportPdf = useCallback(() => {
    const pdfFilters: PdfFilters = {
      dataInizio: filters.dataInizio || undefined,
      dataFine:   filters.dataFine   || undefined,
      stato:      statoFiltro        || undefined,
      comune:     filters.comune     || undefined,
      esecutore:  filters.esecutore  || undefined,
      cesta:      !mostraCesta || cestaFiltro === ''
        ? undefined
        : cestaFiltro === SENZA_RIFERIMENTO ? 'senza cesta' : cestaFiltro,
    };
    exportMisuratoriPdf(visibleRows, pdfFilters, { titolo: titoloPdf, mostraPdr, mostraCesta });
  }, [visibleRows, filters, statoFiltro, mostraCesta, cestaFiltro, titoloPdf, mostraPdr]);

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
            {numeroIt(counts.total)}
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
                {numeroIt(counts.byStato[s])}
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
        {mostraCesta && (
          <label className="flex w-44 flex-col gap-1">
            <span className="text-xs text-[var(--brand-text-muted)]">Cesta</span>
            {/* «Senza cesta» è la domanda vera a fine giornata: cosa è ancora in furgone. */}
            <Select value={cestaFiltro} onChange={e => setCestaFiltro(e.target.value)}>
              <option value="">Tutte</option>
              <option value={SENZA_RIFERIMENTO}>Senza cesta</option>
              {ceste.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>
        )}
      </div>

      {/*
        La barra della selezione: compare con le spunte e scrive la cesta in blocco.
        Fissa come i filtri (la tabella scorre sotto): mentre si spuntano trenta righe la barra
        non deve scappare fuori schermo.
      */}
      {mostraCesta && selezione.size > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] px-3 py-2 shadow-[var(--shadow-sm)]">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-text-main)]">
            <Package className="h-4 w-4" aria-hidden />
            {selezione.size} {selezione.size === 1 ? 'misuratore selezionato' : 'misuratori selezionati'}
          </span>
          <label className="flex items-center gap-2">
            <span className="text-xs text-[var(--brand-text-muted)]">Numero cesta</span>
            {/* La larghezza sta sul contenitore: Input porta un `w-full` suo. */}
            <span className="w-28">
              <Input
                value={cestaInput}
                onChange={e => setCestaInput(e.target.value)}
                // `!assegnando` anche qui: l'Invio non passa dal `disabled` del bottone, e
                // due Invii rapidi erano due POST in blocco sulla stessa selezione.
                onKeyDown={e => { if (e.key === 'Enter' && cestaInput.trim() && !assegnando) void handleAssegnaCesta(cestaInput); }}
                disabled={assegnando}
                placeholder="es. 3"
                aria-label="Numero della cesta da assegnare alla selezione"
              />
            </span>
          </label>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleAssegnaCesta(cestaInput)}
            disabled={!cestaInput.trim()}
            loading={assegnando}
          >
            Assegna cesta
          </Button>
          {/* La correzione: la selezione torna «senza cesta» (ancora in furgone). */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAssegnaCesta(null)}
            loading={assegnando}
            title="Toglie il numero di cesta dai misuratori selezionati"
          >
            Togli dalla cesta
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelezione(new Set());
              /*
                Il bottone sparisce CON la barra che lo ospita: senza una destinazione il
                focus cadrebbe sul body e il giro di Tab ripartirebbe dall'inizio della
                pagina. L'area tabella (tabIndex -1) è il posto dove il lavoro continua.
              */
              areaTabella.current?.focus();
            }}
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
          // `radius-lg` come ogni superficie sorella di questa pila (KPI, filtri, tabella):
          // era l'unico riquadro a `md`, che è il raggio di input e bottoni (§5).
          className="flex shrink-0 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--brand-text-main)]"
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
        testo spesso non viene annunciata). Dice il VISIBILE, non il totale: i filtri rapidi
        sono client-side e non rifanno la fetch, quindi «60 nel registro» a filtro attivo era
        una risposta alla domanda sbagliata. E dice anche la cesta, che compare e cambia senza
        che un lettore di schermo ne sappia nulla.
      */}
      <p role="status" className="sr-only">
        {loading
          ? 'Caricamento del registro…'
          : `${visibleRows.length === counts.total
              ? `${counts.total} misuratori nel registro`
              : `${visibleRows.length} misuratori visibili su ${counts.total}`}${
              selezione.size > 0 ? `, ${selezione.size} selezionati` : ''}.`}
      </p>

      {/* Area tabella: UNICA parte che scorre. `tabIndex -1`: destinazione del focus quando
          la barra della cesta si smonta da sotto il bottone che l'ha chiusa. */}
      <div
        ref={areaTabella}
        tabIndex={-1}
        className="relative min-h-0 flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]">
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
          mostraCesta={mostraCesta}
          selezione={mostraCesta ? selezione : undefined}
          onSelezione={mostraCesta ? setSelezione : undefined}
          salvando={salvando}
        />
      </div>
    </div>
  );
}
