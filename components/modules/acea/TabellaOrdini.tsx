'use client';

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
  type ColumnDef, type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, TriangleAlert } from 'lucide-react';
import {
  AVVISO_MATRICOLA_TRONCA, AVVISO_REVOCA, eRevocaDaVerificare, valoreCella, tonoScadenza,
  type DefColonna, type RigaTabella, type TonoScadenza,
} from '@/lib/acea/colonneTabella';
import { ordinabile, type FiltriUI, type Opzioni } from '@/lib/acea/filtriOrdini';
import { selezionaRighe } from '@/lib/acea/selezioneRighe';
import Skeleton from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import FiltroColonna from './FiltroColonna';
import ManigliaColonna from './ManigliaColonna';
import type { ComandiColonne } from './useLayoutTabella';

/** Altezza fissa di riga: serve al virtualizzatore per calcolare la finestra visibile. */
const ALTEZZA_RIGA = 36;

/**
 * Altezza minima della vista, e tetto di sicurezza.
 *
 * L'altezza vera non si calcola più: la tabella è l'ultimo anello di una catena flex che parte da
 * `h-[calc(100dvh-6rem)]` sulla pagina, quindi prende quello che avanza. Prima la scontava da sé
 * (`clamp(320px, calc(100dvh - 22rem), 1400px)`) e quel `22rem` era un numero da tenere allineato a
 * mano con testa, contatori e barre: era corto di un'ottantina di pixel, e la pagina scorreva per
 * mostrare una tabella che a sua volta scorreva.
 *
 * `MAX` è una rete, non un layout: se un domani un antenato perde il suo `min-h-0`, `height: 100%`
 * si risolve su un genitore ad altezza automatica e la tabella crescerebbe quanto le sue 5.000
 * righe virtualizzate — cioè decine di migliaia di pixel. Con il tetto il guasto resta una tabella
 * alta uno schermo: visibile, e non una pagina che non finisce più.
 */
const ALTEZZA_MIN = 240;
const ALTEZZA_MAX = '100dvh';

/*
  Token `--status-*` e non i semantici: qui il colore È l'informazione (scaduto / in scadenza),
  non serve alla leggibilità di un testo lungo. È la distinzione di DESIGN.md §«Semantici e stato»,
  quella che si sbaglia più spesso. I valori coincidono, il nome dichiara l'intento — e se un
  giorno il rosso dei ritardi dovesse divergere dal rosso degli errori, questo punto è già giusto.
*/
/*
  Le colonne su cui il CLICK spunta la riga: quelle d'identità, «fino alla Matricola».

  Il quadratino era un bersaglio da 16px su righe da 36: per selezionare si mirava. Ora tutta la
  parte sinistra della riga — ODL, Attività/Impianto, Matricola, le colonne che non si scrivono
  mai — spunta la riga come il checkbox, shift-click compreso per l'intervallo. Le colonne dopo
  restano celle: cursore, copia, editor. Su QUESTE il cursore di cella resta raggiungibile con
  le frecce (per copiare un ODL nudo): cambia solo cosa fa il click.
*/
const COLONNE_CLICK_RIGA = new Set<string>(['odl', 'attivita', 'impianto', 'matricola']);

/**
 * Copia l'ODL nudo negli appunti — il numero che si cerca su ACEA e si detta al telefono.
 *
 * È il pezzo che il click-selezione si era mangiato: prima si cliccava la cella ODL e Ctrl+C
 * copiava il numero; ora quel click spunta la riga, e Ctrl+C con delle spunte porta via le righe
 * intere. L'icona che compare al passaggio è la via col mouse; da tastiera restano le frecce
 * (il cursore di cella ci arriva ancora) e Ctrl+C.
 */
async function copiaOdl(odl: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(odl);
    toast.success(`ODL ${odl} copiato`);
  } catch {
    toast.error('Copia non riuscita: il browser ha negato gli appunti.');
  }
}

const TONO_CLASSE: Record<TonoScadenza, string> = {
  scaduto: 'text-[var(--status-ko)] font-semibold',
  oggi: 'text-[var(--status-warn)] font-semibold',
  vicino: 'text-[var(--status-warn)]',
  lontano: '',
  nessuna: 'text-[var(--brand-text-muted)]',
};

export type Props = {
  righe: RigaTabella[];
  colonne: DefColonna[];
  colonneVisibili: Set<string>;
  oggi: string;
  selezione: RowSelectionState;
  /**
   * Accetta anche l'UPDATER, come `setState`: i click in raffica sulle righe devono partire
   * ciascuno dallo stato vero del momento, non dalla fotografia dell'ultimo render.
   */
  onSelezione: Dispatch<SetStateAction<RowSelectionState>>;
  caricando?: boolean;
  /** Filtri delle intestazioni. Assenti = tabella senza imbuti (nessun uso oggi, ma il tipo lo dice). */
  filtri?: FiltriUI;
  onFiltri?: (f: FiltriUI) => void;
  /** Valori distinti dell'intero registro, per i filtri a elenco. */
  opzioni?: Opzioni;
  /**
   * Colonne mobili: larghezze e ordine decisi dall'utente. Assente = colonne fisse come da
   * definizione (nessun uso oggi, ma la tabella deve poter vivere senza).
   */
  comandiColonne?: ComandiColonne;
  /** Editing a griglia sulle sole colonne modificabili. Assente = tabella in sola lettura. */
  editing?: {
    /** Posizione della colonna nella griglia (tutte quelle a schermo), o null se non c'è. */
    indiceColonna: (chiave: string) => number | null;
    /** `true` solo dove si può SCRIVERE: muoversi e copiare si può ovunque. */
    editabile: (chiave: string) => boolean;
    focus: { riga: number; colonna: number } | null;
    celleSelezionate: Set<string>;
    valoreLocale: (r: RigaTabella, chiave: string) => string | null;
    onClickCella: (riga: number, colonna: number, shift: boolean) => void;
    /** Editor della Data pianificata: doppio click (o Enter/F2) apre un `<input type="date">`. */
    editorData: { riga: number; colonna: number } | null;
    onApriEditorData: (riga: number, colonna: number) => void;
    onChiudiEditorData: () => void;
    onConfermaData: (riga: number, colonna: number, valoreIso: string) => void;
    /** L'ISO grezzo della cella (la cella mostra dd/mm/yyyy, all'input serve YYYY-MM-DD). */
    valoreIsoData: (riga: number) => string;
    /** Confini del calendario: la finestra programmabile, quando è nota. */
    finestraData?: { min: string; max: string };
    /**
     * Menu dell'Esecutore: su una cella VUOTA si apre al primo click, ed è l'unico modo di
     * inserire un nome a mano — si sceglie fra chi è in cronoprogramma, niente testo libero.
     */
    editorEsecutore: { riga: number; colonna: number } | null;
    onApriEditorEsecutore: (riga: number, colonna: number) => void;
    onChiudiEditorEsecutore: () => void;
    onConfermaEsecutore: (riga: number, colonna: number, nome: string) => void;
    /** Chi si può scegliere, giorno per giorno della finestra: le voci del menu. */
    operatoriFinestra: Array<{
      data: string;
      etichetta: string;
      esteso: string;
      operatori: Array<{ id: string; display_name: string; territorio?: string | null }>;
    }>;
    /** Nome dell'attività di tabellone della vista (DUNNING / LIMITAZIONI MASSIVE), per lo stato vuoto. */
    etichettaAttivita?: string;
  };
};

/** Chiave stabile di riga: la coppia, perché un ODL può avere più operazioni. */
export const chiaveRiga = (r: RigaTabella) => `${r.odl}|${r.numero_operazione}`;

/** Id di una cella modificabile: stesse coordinate del focus, così `aria-activedescendant` combacia. */
const idCella = (riga: number, colonna: number) => `acea-cella-${riga}-${colonna}`;

/**
 * Tabella del registro ordini.
 *
 * Virtualizzata dalla prima riga di codice: il registro arriva a 5.000+ righe e con 10-20 colonne
 * significherebbe 100.000 celle nel DOM. Si rendono solo quelle nella finestra visibile.
 *
 * La selezione multipla supporta shift-click sull'intervallo, che è il gesto con cui in Excel si
 * prende un blocco di righe prima di scrivere esecutore e data.
 *
 * Ogni intestazione porta l'ordinamento a sinistra e l'imbuto del filtro a destra. L'imbuto NON
 * filtra le righe caricate: manda i criteri al server (vedi `FiltroColonna`), perché a schermo
 * ci sono 300 righe di 5.000 e filtrare il caricato darebbe un conteggio che non vuol dire nulla.
 */
export default function TabellaOrdini({
  righe, colonne, colonneVisibili, oggi, selezione, onSelezione, caricando = false, editing,
  filtri, onFiltri, opzioni, comandiColonne,
}: Props) {
  /** Colonna in trascinamento. In un ref e non in stato: cambia a ogni `dragover`, non si disegna. */
  const trascinata = useRef<string | null>(null);
  /** Durante il ridimensionamento il trascinamento va spento, o il browser prova a fare entrambi. */
  const [ridimensionando, setRidimensionando] = useState(false);
  /** Elemento che scorre: è lo `scrollElement` del virtualizzatore, deve restare quello esterno. */
  const contenitore = useRef<HTMLDivElement>(null);
  /** Elemento con `role="grid"`: è questo a prendere il focus e a portare `aria-activedescendant`. */
  const griglia = useRef<HTMLDivElement>(null);
  // Indice dell'ultima riga cliccata: base dello shift-click.
  const ultimaCliccata = useRef<number | null>(null);

  const visibili = useMemo(
    () => colonne.filter((c) => colonneVisibili.has(c.chiave)),
    [colonne, colonneVisibili],
  );

  const columns = useMemo<ColumnDef<RigaTabella>[]>(
    () => visibili.map((c) => ({
      id: c.chiave,
      header: c.intestazione,
      accessorFn: (r: RigaTabella) => valoreCella(r, c.chiave),
      enableSorting: true,
    })),
    [visibili],
  );

  const table = useReactTable({
    data: righe,
    columns,
    state: { rowSelection: selezione },
    // Updater passato COM'È: risolverlo qui sulla `selezione` del render ricascherebbe nel
    // difetto della closure vecchia che `clickRiga` ha appena tolto.
    onRowSelectionChange: onSelezione,
    getRowId: (r) => chiaveRiga(r),
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    /*
      NESSUN `getSortedRowModel`: l'ordinamento non si fa piu` qui.

      Ordinava le sole righe SCESE — 300 su 5.000+ — quindi «il primo gruppo» era il primo delle
      righe capitate a schermo, non del registro. Stesso difetto dei filtri, sull'altro asse, e
      altrettanto invisibile: una tabella ordinata male sembra una tabella ordinata bene.
      Ora la colonna cliccata diventa un criterio della query (vedi `ORDINAMENTI`), e le righe
      arrivano gia` nell'ordine giusto.
    */
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => contenitore.current,
    estimateSize: () => ALTEZZA_RIGA,
    overscan: 12,
  });

  /*
    Il cursore di cella deve restare in vista.

    La lista è virtualizzata: fuori dalla finestra visibile la riga viene SMONTATA. Senza questo
    effetto, tenendo premuta la freccia giù il contorno del cursore usciva dallo schermo e non
    tornava più — e `aria-activedescendant` puntava a un id che nel DOM non esisteva più, quindi
    anche l'annuncio spariva. Vale per chiunque usi la tastiera, non solo per gli screen reader.
  */
  const rigaFocus = editing?.focus?.riga;
  useEffect(() => {
    if (rigaFocus === undefined) return;
    virtualizer.scrollToIndex(rigaFocus, { align: 'auto' });
  }, [rigaFocus, virtualizer]);

  /**
   * Un click sulla spunta di una riga, con o senza shift.
   *
   * La regola sta in `selezionaRighe` e non qui: e` logica di dominio, e si e` gia` rotta una volta
   * (vedi il commento in quel file). Questo resta il solo punto che la invoca, ed e` invocato UNA
   * volta per click.
   *
   * AGGIORNAMENTO FUNZIONALE, non dalla prop. Da quando la riga si spunta cliccandola, i click
   * arrivano in raffica — e due click ravvicinati potevano leggere entrambi la selezione del
   * RENDER PRECEDENTE: il secondo ripartiva da uno stato senza il primo, e il flag appena messo
   * spariva. Con l'updater ogni click parte dallo stato VERO del momento, non dalla fotografia
   * della closure. (`ultimaCliccata` si scrive dentro l'updater: in StrictMode gira due volte,
   * ma con lo stesso esito — la scrittura e` idempotente.)
   */
  const clickRiga = (indice: number, shift: boolean) => {
    onSelezione((prec) => {
      const esito = selezionaRighe(
        prec,
        rows.map((r) => r.id),
        indice,
        shift,
        ultimaCliccata.current,
      );
      ultimaCliccata.current = esito.ancora;
      return esito.selezione;
    });
  };

  const tutteSelezionate = rows.length > 0 && rows.every((r) => selezione[r.id]);

  /** Larghezza in vigore: quella scelta dall'utente se c'è, altrimenti la base della definizione. */
  const larghezzaDi = (c: DefColonna) => comandiColonne?.larghezza?.(c.chiave) ?? c.larghezza;
  const larghezzaTotale = visibili.reduce((s, c) => s + larghezzaDi(c), 0) + 40;

  /**
   * Le colonne non hanno una larghezza fissa ma una BASE che possono superare.
   *
   * Con `width` fisso più `minWidth: '100%'` sul contenitore, quando le colonne visibili sommavano
   * meno della finestra restava una fascia vuota a destra — e con la larghezza fissa le colonne
   * lunghe (Attività, Indirizzo) troncavano anche quando lo spazio c'era. `flex: 1 1 <base>` con
   * `minWidth: <base>` risolve entrambi: sotto la base non si scende mai, sopra si distribuisce
   * quello che avanza.
   *
   * Una larghezza scelta A MANO smette invece di crescere (`flex: 0 0`): lasciarla elastica
   * significherebbe vederla saltare a un'altra misura nell'istante in cui si rilascia il mouse,
   * perché la distribuzione dello spazio residuo la riallargherebbe. Sembrerebbe un comando rotto.
   */
  const stileColonna = (c: DefColonna) => {
    const w = larghezzaDi(c);
    return comandiColonne?.personalizzata?.(c.chiave)
      ? { flex: `0 0 ${w}px`, width: w, minWidth: w }
      : { flex: `1 1 ${w}px`, minWidth: w };
  };

  /*
    `min-h-0`: un figlio flex ha `min-height: auto` di default e senza si rifiuterebbe di
    rimpicciolirsi sotto il proprio contenuto — con 5.000 righe virtualizzate significa traboccare
    fuori dallo schermo invece di scorrere. Vale su OGNI anello della catena, da qui fino alla
    pagina.
  */
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div
        ref={contenitore}
        className="w-full overflow-auto focus-within:outline-none"
        style={{ height: '100%', minHeight: ALTEZZA_MIN, maxHeight: ALTEZZA_MAX }}
      >
        {/*
          `tabIndex` e `role="grid"` sullo STESSO elemento: gli screen reader entrano in modalità
          focus (e consegnano le frecce all'applicazione) solo se il nodo che riceve il focus è
          quello che porta il ruolo. Tenendoli separati — ruolo qui, focus sul contenitore di
          scorrimento — le frecce restavano alla navigazione del lettore.

          Le celle non sono focalizzabili: sono div in una lista virtualizzata, darle al tab
          significherebbe far tabulare 5.000 elementi. Il cursore di cella è quindi dichiarato con
          `aria-activedescendant`, che è il modo previsto per una griglia a fuoco unico.

          `+1` nei conteggi: nell'ARIA la riga di intestazione è la 1 e la colonna delle spunte è
          la 1, quindi i dati partono da 2.
        */}
        <div
          ref={griglia}
          role="grid"
          aria-rowcount={rows.length + 1}
          aria-colcount={visibili.length + 1}
          tabIndex={editing ? 0 : undefined}
          aria-label={
            editing
              ? 'Registro ordini. Premi una freccia per entrare nella griglia modificabile, Esc per uscirne.'
              : undefined
          }
          aria-activedescendant={
            editing?.focus ? idCella(editing.focus.riga, editing.focus.colonna) : undefined
          }
          onKeyDown={(e) => {
            if (!editing || editing.focus || rows.length === 0) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) {
              e.preventDefault();
              editing.onClickCella(0, 0, false);
            }
          }}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
          style={{ width: larghezzaTotale, minWidth: '100%' }}
        >
          {/* intestazione */}
          <div
            role="row"
            aria-rowindex={1}
            className="sticky top-0 z-10 flex border-b border-[var(--brand-border-strong)] bg-[var(--brand-surface-muted)] text-xs font-semibold text-[var(--brand-text-muted)]"
          >
            <div className="flex w-10 shrink-0 items-center justify-center" role="columnheader">
              <input
                type="checkbox"
                aria-label="Seleziona tutte le righe caricate"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={tutteSelezionate}
                onChange={(e) => {
                  const agg: RowSelectionState = {};
                  if (e.target.checked) for (const r of rows) agg[r.id] = true;
                  onSelezione(agg);
                }}
              />
            </div>
            {table.getHeaderGroups()[0]?.headers.map((h, i) => {
              const col = visibili[i];
              // L'ordinamento e` quello dei FILTRI, cioe` della query: la freccia mostra come e`
              // ordinato il registro, non come sono ordinate le righe scese.
              const ordinabileQui = col ? ordinabile(col.chiave) : false;
              const dir = filtri && ordinabileQui && filtri.ordina === col?.chiave
                ? filtri.verso
                : false;
              return (
                <div
                  key={h.id}
                  role="columnheader"
                  aria-colindex={i + 2}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  style={col ? stileColonna(col) : undefined}
                  /*
                    L'intera intestazione è l'appiglio del trascinamento, non una maniglia
                    dedicata: un'icona in più su ogni colonna, tutti i giorni, per un gesto che
                    in ogni foglio di calcolo si fa afferrando l'intestazione. Il click sul
                    titolo continua a ordinare — click e trascinamento sono gesti distinti.
                  */
                  draggable={Boolean(comandiColonne) && !ridimensionando}
                  onDragStart={(e) => {
                    if (!col) return;
                    trascinata.current = col.chiave;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', col.chiave);
                  }}
                  onDragOver={(e) => {
                    if (trascinata.current && col && trascinata.current !== col.chiave) {
                      // Senza `preventDefault` il browser rifiuta il rilascio: è la riga che
                      // dichiara «qui si può lasciare».
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const da = trascinata.current ?? e.dataTransfer.getData('text/plain');
                    if (da && col) comandiColonne?.onSposta(da, col.chiave);
                    trascinata.current = null;
                  }}
                  onDragEnd={() => { trascinata.current = null; }}
                  className={`relative flex items-center gap-0.5 pl-2 pr-1 ${
                    comandiColonne ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={!ordinabileQui}
                    onClick={() => {
                      // La guardia `ordinabile` e` anche un type guard: sotto, `col.chiave` e`
                      // ristretta alle sole colonne che il server sa ordinare.
                      if (!col || !filtri || !onFiltri || !ordinabile(col.chiave)) return;
                      // Terzo click: si torna all'ordine canonico. Senza, una volta ordinato non si
                      // potrebbe piu` tornare alla vista di partenza se non ricaricando.
                      const gia = filtri.ordina === col.chiave;
                      onFiltri({
                        ...filtri,
                        ordina: gia && filtri.verso === 'desc' ? null : col.chiave,
                        verso: gia && filtri.verso === 'asc' ? 'desc' : 'asc',
                      });
                    }}
                    title={
                      ordinabileQui
                        ? `Ordina per ${col?.intestazione ?? ''} (tutto il registro)`
                        : `${col?.intestazione ?? ''}: ordinamento non disponibile sul registro intero`
                    }
                    // Riordino da tastiera: senza, spostare una colonna resterebbe un gesto da
                    // solo mouse. Dichiarato in `aria-keyshortcuts`, che è il posto in cui uno
                    // screen reader lo va a leggere.
                    aria-keyshortcuts={comandiColonne ? 'Control+ArrowLeft Control+ArrowRight' : undefined}
                    onKeyDown={(e) => {
                      if (!comandiColonne || !col || !e.ctrlKey) return;
                      if (e.key === 'ArrowLeft') { e.preventDefault(); comandiColonne.onSpostaDi(col.chiave, -1); }
                      else if (e.key === 'ArrowRight') { e.preventDefault(); comandiColonne.onSpostaDi(col.chiave, 1); }
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-1 rounded-[var(--radius-sm)] py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                      ordinabileQui ? 'hover:text-[var(--brand-text-main)]' : 'cursor-default'
                    }`}
                  >
                    <span className="truncate">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </span>
                    {dir === 'asc' && <ArrowUp size={12} aria-hidden="true" />}
                    {dir === 'desc' && <ArrowDown size={12} aria-hidden="true" />}
                    {/* Nessuna doppia freccia sulle colonne non ordinabili: sarebbe un comando
                        disegnato che non fa niente. */}
                    {!dir && ordinabileQui && (
                      <ChevronsUpDown size={12} aria-hidden="true" className="opacity-40" />
                    )}
                  </button>
                  {col?.filtro && filtri && onFiltri && (
                    <FiltroColonna
                      intestazione={col.intestazione}
                      filtro={col.filtro}
                      filtri={filtri}
                      onChange={onFiltri}
                      valori={
                        col.filtro.tipo === 'elenco'
                          ? (opzioni?.[col.filtro.opzioni] ?? [])
                          : col.filtro.tipo === 'esecutore'
                            ? (opzioni?.esecutori ?? [])
                            : []
                      }
                    />
                  )}
                  {comandiColonne && col && (
                    <ManigliaColonna
                      chiave={col.chiave}
                      intestazione={col.intestazione}
                      larghezza={larghezzaDi(col)}
                      onLarghezza={comandiColonne.onLarghezza}
                      onAzzera={comandiColonne.onAzzeraLarghezza}
                      onInizio={() => setRidimensionando(true)}
                      onFine={() => setRidimensionando(false)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* corpo virtualizzato — `rowgroup` perché fra `grid` e `row` non può esserci un div nudo */}
          <div role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const r = row.original;
              const tono = tonoScadenza(r, oggi);
              const scelta = Boolean(selezione[row.id]);
              /*
                REVOCA APERTA: tutta la riga in rossastro, col perché nel tooltip.

                Le REVO arrivano fra le attivazioni con la STESSA attività scritta delle RIAT
                («Regolarizzazione», «Riattivazione»): a tabella non c'è nessun altro segno, e la
                verifica sul sistema ACEA — è davvero una revoca, o va trasformata? — si fa solo
                se la riga si fa notare. `--status-ko-soft` perché il colore È l'informazione;
                la spunta vince sul rossastro (è il gesto in corso), il tooltip resta.
              */
              const revoca = eRevocaDaVerificare(r);
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={vi.index + 2}
                  aria-selected={scelta}
                  title={revoca ? AVVISO_REVOCA : undefined}
                  className={`absolute left-0 flex w-full border-b border-[var(--brand-border)] text-sm ${
                    scelta
                      ? 'bg-[var(--brand-primary-soft)]'
                      : revoca
                        ? 'bg-[var(--status-ko-soft)]'
                        : 'hover:bg-[var(--brand-surface-muted)]'
                  }`}
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <div className="flex w-10 shrink-0 items-center justify-center" role="gridcell">
                    {/*
                      La `label` riempie tutta la cella, e non e` cosmetica.

                      Il quadratino e` 16px in una cella da 40: cliccando appena fuori non
                      succedeva niente, e su una riga gia` spuntata sembrava bloccata — il click
                      per toglierla cadeva a vuoto e la spunta restava. Con la label il bersaglio
                      e` l'intera cella, e il browser inoltra il click al checkbox, quindi il
                      gestore resta UNO SOLO: raddoppiarlo rimetterebbe due toggle sullo stesso
                      gesto, che si annullano a vicenda.
                    */}
                    <label className="flex h-full w-full cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Seleziona ordine ${r.odl}`}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
                      checked={scelta}
                      /*
                        Tutto nel `click`, niente nel `change`.

                        React ricava l'evento `change` di un checkbox DAL CLICK, e `preventDefault()`
                        non lo sopprime: tenendo un gestore su ciascuno, uno shift-click ne faceva
                        partire due, che ricostruivano la selezione dallo stesso stato di render e
                        si sovrascrivevano a vicenda — l'intervallo spariva e restava il toggle.
                        La spunta e` controllata da `checked`, quindi il toggle nativo non serve.
                      */
                      onChange={() => { /* la selezione la decide il click */ }}
                      onClick={(e) => {
                        e.preventDefault();
                        clickRiga(vi.index, e.shiftKey);
                      }}
                    />
                    </label>
                    {/*
                      FUORI dalla label, apposta: l'`aria-label` del checkbox ne scarta il
                      contenuto, e lì dentro questo testo non verrebbe mai letto. Qui è un nodo
                      della riga: chi la percorre col lettore di schermo sente il perché del
                      colore, che da solo non dice niente a chi non lo vede.
                    */}
                    {revoca && <span className="sr-only">{AVVISO_REVOCA}</span>}
                  </div>
                  {visibili.map((c, iCol) => {
                    // Ogni colonna e` una cella della griglia: selezionabile e copiabile. La
                    // scrittura resta sulle due, ed e` `scrivibile` a dirlo.
                    const iEdit = editing?.indiceColonna(c.chiave) ?? null;
                    const scrivibile = editing?.editabile(c.chiave) ?? false;
                    const locale = editing?.valoreLocale(r, c.chiave) ?? null;
                    const testo = locale ?? valoreCella(r, c.chiave);
                    const evidenzia = c.chiave === 'scadenza';
                    // Il gruppo PRESTATO dal CAP/comune, non calcolato dalle coordinate della
                    // riga. Si smorza invece di marcare il numero: chi legge «162» deve poterlo
                    // dettare com'e`, ma chi ci monta sopra un giro deve vedere che e` una stima.
                    const gruppoStimato = c.chiave === 'gruppo' && r.microarea_stimata === true;
                    /*
                      Pianificazione a metà: c'è l'esecutore o la data, non entrambi.

                      Il valore si mostra — è stato scritto, e mostrarlo è tutto il senso di poterlo
                      scrivere — ma smorzato, perché una cella che sembra una pianificazione e non
                      genera nessun rapportino è peggio di una cella vuota: la vuota si nota, questa
                      no. Stesso canale del gruppo stimato: lo stile dice «attenzione», il dato resta
                      leggibile e copiabile com'è.
                    */
                    const aMeta = r.pianificazione_parziale === true
                      && (c.chiave === 'pianificato_a' || c.chiave === 'pianificato_il');
                    const inFocus =
                      iEdit !== null && editing?.focus?.riga === vi.index && editing.focus.colonna === iEdit;
                    const inSelezione =
                      iEdit !== null && editing?.celleSelezionate.has(`${vi.index}:${iEdit}`);
                    const inEditor =
                      iEdit !== null
                      && c.chiave === 'pianificato_il'
                      && editing?.editorData?.riga === vi.index
                      && editing.editorData.colonna === iEdit;
                    const inEditorEsecutore =
                      iEdit !== null
                      && c.chiave === 'pianificato_a'
                      && editing?.editorEsecutore?.riga === vi.index
                      && editing.editorEsecutore.colonna === iEdit;
                    if (inEditorEsecutore && editing) {
                      /*
                        Il menu dell'Esecutore VIVE nella cella, come il calendario della data.

                        Le voci sono chi è in cronoprogramma, raggruppate per giorno della
                        finestra: la scelta è «chi c'è», non un nome qualsiasi — è il motivo per
                        cui su una cella vuota non c'è testo libero. La stessa persona può
                        comparire in entrambi i giorni: si scrive comunque il nome, il giorno lo
                        decide la cella Data (o la barra).
                      */
                      const vuoto = editing.operatoriFinestra.every((g) => g.operatori.length === 0);
                      return (
                        <div key={c.chiave} role="gridcell" aria-colindex={iCol + 2} style={stileColonna(c)} className="px-1 py-1">
                          <select
                            aria-label={`Esecutore, ODL ${r.odl}: scegli chi è in cronoprogramma`}
                            defaultValue=""
                            ref={(el) => el?.focus()}
                            onChange={(e) => {
                              if (e.currentTarget.value) {
                                editing.onConfermaEsecutore(vi.index, iEdit, e.currentTarget.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') { e.stopPropagation(); editing.onChiudiEditorEsecutore(); }
                            }}
                            onBlur={() => editing.onChiudiEditorEsecutore()}
                            className="h-full w-full rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1 text-sm text-[var(--brand-text-main)] focus:outline-none"
                          >
                            <option value="" disabled>
                              {vuoto
                                ? `Nessuno su ${editing.etichettaAttivita ?? 'DUNNING'} in tabellone: compilalo nel cronoprogramma`
                                : 'Scegli operatore…'}
                            </option>
                            {editing.operatoriFinestra.map((g) => (
                              g.operatori.length > 0 && (
                                <optgroup key={g.data} label={`${g.etichetta} · ${g.esteso}`}>
                                  {g.operatori.map((o) => (
                                    // Il VALORE è il nome, non l'id: la conferma passa dalla
                                    // stessa validazione dell'incolla (`validaOperatore`), che
                                    // risolve per corrispondenza esatta.
                                    <option key={`${g.data}|${o.id}`} value={o.display_name}>
                                      {o.territorio ? `${o.display_name} · ${o.territorio}` : o.display_name}
                                    </option>
                                  ))}
                                </optgroup>
                              )
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (inEditor && editing) {
                      /*
                        L'editor della data VIVE nella cella: stesso posto, stessa larghezza.

                        `defaultValue` e non `value`: l'input è vivo solo finché è aperto, e
                        controllarlo da fuori farebbe passare ogni battuta dallo stato della
                        griglia. La conferma è Enter, il blur, o la scelta dal calendario;
                        Esc chiude senza scrivere. Un valore identico a quello iniziale non
                        parte nemmeno: sarebbe una chiamata per non cambiare niente.
                      */
                      const iniziale = editing.valoreIsoData(vi.index);
                      const conferma = (valore: string) => {
                        if (valore && valore !== iniziale) {
                          editing.onConfermaData(vi.index, iEdit, valore);
                        } else {
                          editing.onChiudiEditorData();
                        }
                      };
                      return (
                        <div key={c.chiave} role="gridcell" aria-colindex={iCol + 2} style={stileColonna(c)} className="px-1 py-1">
                          <input
                            type="date"
                            aria-label={`Data pianificata, ODL ${r.odl}`}
                            defaultValue={iniziale}
                            min={editing.finestraData?.min}
                            max={editing.finestraData?.max}
                            // `showPicker` apre subito il calendario: il doppio click è il
                            // gesto-utente che lo autorizza. Se il browser non lo sa fare,
                            // l'input resta comunque scrivibile a mano.
                            ref={(el) => {
                              if (!el) return;
                              el.focus();
                              try { el.showPicker?.(); } catch { /* si scrive a mano */ }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); conferma(e.currentTarget.value); }
                              if (e.key === 'Escape') { e.stopPropagation(); editing.onChiudiEditorData(); }
                            }}
                            onBlur={(e) => conferma(e.currentTarget.value)}
                            className="h-full w-full rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1 text-sm text-[var(--brand-text-main)] focus:outline-none"
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={c.chiave}
                        role="gridcell"
                        // `+2`: la colonna 1 dell'ARIA è quella delle spunte.
                        aria-colindex={iCol + 2}
                        id={iEdit === null ? undefined : idCella(vi.index, iEdit)}
                        aria-selected={iEdit === null ? undefined : Boolean(inSelezione)}
                        // Una cella che contiene solo «Rossi» non dice su quale ordine si è: il
                        // nome accessibile lega colonna, ODL e valore.
                        aria-label={
                          iEdit === null
                            ? undefined
                            : `${c.intestazione}, ODL ${r.odl} operazione ${r.numero_operazione}: ${testo || 'vuoto'}`
                        }
                        style={stileColonna(c)}
                        title={
                          c.chiave === 'matricola' && r.sospetto_troncamento
                            ? AVVISO_MATRICOLA_TRONCA
                            : gruppoStimato
                              ? `Gruppo ${testo} stimato dal ${r.comune?.toUpperCase() === 'ROMA' ? 'CAP' : 'comune'}: `
                                + 'questo ordine non e` ancora geocodificato, quindi la zona e` approssimata.'
                              : aMeta
                                ? 'Pianificazione a meta`: manca l\'altra fra esecutore e data. '
                                  + 'Finche` non ci sono entrambe questa riga non genera nessun rapportino.'
                                : testo
                        }
                        onMouseDown={
                          COLONNE_CLICK_RIGA.has(c.chiave)
                            ? (e) => {
                                /*
                                  Colonna d'identità: il click spunta la riga, come il checkbox.
                                  Solo il tasto PRINCIPALE e solo il primo click della coppia:
                                  `mousedown` scatta anche per destro e centrale (il menu
                                  contestuale su un ODL spuntava la riga), e il secondo click di
                                  un doppio click la spuntava e la rispegneva.
                                */
                                if (e.button !== 0 || e.detail > 1) return;
                                e.preventDefault();
                                clickRiga(vi.index, e.shiftKey);
                              }
                            : iEdit === null
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                editing?.onClickCella(vi.index, iEdit, e.shiftKey);
                                // `preventDefault` impedisce il focus di default, che senza questa
                                // riga restava sul `<body>`: il cursore ARIA non veniva letto e il
                                // Tab successivo ripartiva dall'inizio del documento.
                                griglia.current?.focus();
                                /*
                                  Su una cella Esecutore VUOTA il menu si apre al PRIMO click:
                                  è l'unico modo di inserire un nome a mano, quindi non c'è
                                  ragione di chiedere un secondo gesto. Su una cella piena il
                                  click resta selezione (si copia, si estende con shift): per
                                  CAMBIARE un nome c'è il doppio click, come per la data.
                                */
                                if (
                                  c.chiave === 'pianificato_a' && scrivibile && !e.shiftKey
                                  && !locale && !r.pianificato_a
                                ) {
                                  editing?.onApriEditorEsecutore(vi.index, iEdit);
                                }
                              }
                        }
                        // Doppio click: l'editor della cella — calendario sulla Data, menu degli
                        // operatori sull'Esecutore. Le guardie sulle colonne stanno negli `onApri*`,
                        // quindi sugli altri campi il doppio click non fa niente di diverso da due click.
                        onDoubleClick={
                          iEdit === null || !scrivibile
                            ? undefined
                            : c.chiave === 'pianificato_il'
                              ? () => editing?.onApriEditorData(vi.index, iEdit)
                              : c.chiave === 'pianificato_a'
                                ? () => editing?.onApriEditorEsecutore(vi.index, iEdit)
                                : undefined
                        }
                        className={`truncate px-2 py-2 ${c.mono ? 'font-mono tabular-nums' : ''} ${
                          evidenzia ? TONO_CLASSE[tono] : 'text-[var(--brand-text-main)]'
                        } ${scrivibile ? 'cursor-cell' : ''} ${
                          COLONNE_CLICK_RIGA.has(c.chiave) ? 'cursor-pointer' : ''
                        } ${c.chiave === 'odl' ? 'group/odl relative' : ''} ${
                          inSelezione && !inFocus ? 'bg-[var(--brand-primary-soft)]' : ''
                        } ${
                          inFocus
                            ? 'outline outline-2 -outline-offset-2 outline-[var(--brand-primary)]'
                            : ''
                        } ${locale ? 'italic' : ''} ${
                          gruppoStimato ? 'italic text-[var(--brand-text-muted)]' : ''
                        } ${aMeta ? 'italic text-[var(--status-warn)]' : ''}`}
                      >
                        {c.chiave === 'matricola' && r.sospetto_troncamento && (
                          <>
                            {/* L'icona è decorativa e il testo la spiega: `aria-label` su un <svg>
                                senza `role="img"` non viene annunciato da tutti i lettori. */}
                            <TriangleAlert
                              size={12}
                              aria-hidden="true"
                              className="mr-1 inline text-[var(--status-warn)]"
                            />
                            <span className="sr-only">{AVVISO_MATRICOLA_TRONCA}{' '}</span>
                          </>
                        )}
                        {testo}
                        {/*
                          La copia dell'ODL nudo, ripristinata: il click sulla cella ora spunta
                          la riga, e questa icona — visibile al passaggio — è la via col mouse.
                          `stopPropagation` sul mousedown: copiare non deve togliere la spunta.
                          `tabIndex={-1}`: la griglia resta UN solo stop di tabulazione; da
                          tastiera si copia con le frecce + Ctrl+C, come per ogni cella.
                        */}
                        {c.chiave === 'odl' && (
                          <button
                            type="button"
                            aria-label={`Copia ODL ${r.odl}`}
                            title="Copia l'ODL"
                            tabIndex={-1}
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => { e.stopPropagation(); void copiaOdl(r.odl); }}
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-0.5 text-[var(--brand-text-muted)] opacity-0 transition-opacity hover:text-[var(--brand-text-main)] focus-visible:opacity-100 group-hover/odl:opacity-100"
                          >
                            <Copy size={12} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* `caricando` non disegnava niente: al primo carico e a ogni cambio di filtro la
              tabella restava un rettangolo bianco, indistinguibile da «nessun risultato». */}
          {rows.length === 0 && caricando && (
            <div className="space-y-1 p-2" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          )}

          {rows.length === 0 && !caricando && (
            <p className="px-4 py-8 text-center text-sm text-[var(--brand-text-muted)]">
              Nessun ordine con questi filtri.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
