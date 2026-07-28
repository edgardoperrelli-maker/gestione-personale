'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState, type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert } from 'lucide-react';
import {
  valoreCella, tonoScadenza, type DefColonna, type RigaTabella, type TonoScadenza,
} from '@/lib/acea/colonneTabella';
import type { FiltriUI, Opzioni } from '@/lib/acea/filtriOrdini';
import Skeleton from '@/components/ui/Skeleton';
import FiltroColonna from './FiltroColonna';

/** Altezza fissa di riga: serve al virtualizzatore per calcolare la finestra visibile. */
const ALTEZZA_RIGA = 36;

/**
 * Altezza della vista: quanto resta dello schermo, non un numero fisso.
 *
 * Era `560px`. Con la testa di pagina, i contatori e la barra filtri sopra, su un portatile da
 * 768px di altezza restavano fuori sia le ultime righe sia il piede della tabella: si scorreva la
 * PAGINA per raggiungere una tabella che a sua volta scorreva. Il doppio scorrimento è il motivo
 * per cui la vista sembrava non finire mai.
 *
 * `dvh` e non `vh`: su mobile la barra dell'indirizzo che si ritrae cambia `vh` e la tabella
 * "salta". Il minimo di 320px tiene comunque una decina di righe sui portatili bassi.
 */
const ALTEZZA_VISTA = 'clamp(320px, calc(100dvh - 22rem), 1400px)';

/*
  Token `--status-*` e non i semantici: qui il colore È l'informazione (scaduto / in scadenza),
  non serve alla leggibilità di un testo lungo. È la distinzione di DESIGN.md §«Semantici e stato»,
  quella che si sbaglia più spesso. I valori coincidono, il nome dichiara l'intento — e se un
  giorno il rosso dei ritardi dovesse divergere dal rosso degli errori, questo punto è già giusto.
*/
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
  onSelezione: (s: RowSelectionState) => void;
  caricando?: boolean;
  /** Filtri delle intestazioni. Assenti = tabella senza imbuti (nessun uso oggi, ma il tipo lo dice). */
  filtri?: FiltriUI;
  onFiltri?: (f: FiltriUI) => void;
  /** Valori distinti dell'intero registro, per i filtri a elenco. */
  opzioni?: Opzioni;
  /**
   * Vista ingrandita: la tabella prende tutta l'altezza che il contenitore le lascia invece della
   * sua quota di pagina. Il contenitore deve essere un `flex flex-col` con un'altezza definita.
   */
  ingrandita?: boolean;
  /** Editing a griglia sulle sole colonne modificabili. Assente = tabella in sola lettura. */
  editing?: {
    /** Indice della colonna modificabile, o null se la colonna non lo è. */
    indiceEditabile: (chiave: string) => number | null;
    focus: { riga: number; colonna: number } | null;
    celleSelezionate: Set<string>;
    valoreLocale: (r: RigaTabella, chiave: string) => string | null;
    onClickCella: (riga: number, colonna: number, shift: boolean) => void;
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
  filtri, onFiltri, opzioni, ingrandita = false,
}: Props) {
  const [ordinamento, setOrdinamento] = useState<SortingState>([]);
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
    state: { sorting: ordinamento, rowSelection: selezione },
    onSortingChange: setOrdinamento,
    onRowSelectionChange: (agg) => onSelezione(typeof agg === 'function' ? agg(selezione) : agg),
    getRowId: (r) => chiaveRiga(r),
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

  const clickRiga = (indice: number, shift: boolean) => {
    if (shift && ultimaCliccata.current !== null) {
      const [da, a] = [ultimaCliccata.current, indice].sort((x, y) => x - y);
      const agg: RowSelectionState = { ...selezione };
      for (let i = da; i <= a; i++) agg[rows[i].id] = true;
      onSelezione(agg);
      return;
    }
    ultimaCliccata.current = indice;
    const agg: RowSelectionState = { ...selezione };
    if (agg[rows[indice].id]) delete agg[rows[indice].id];
    else agg[rows[indice].id] = true;
    onSelezione(agg);
  };

  const tutteSelezionate = rows.length > 0 && rows.every((r) => selezione[r.id]);
  const larghezzaTotale = visibili.reduce((s, c) => s + c.larghezza, 0) + 40;

  /**
   * Le colonne non hanno più una larghezza fissa ma una BASE che possono superare.
   *
   * Con `width` fisso più `minWidth: '100%'` sul contenitore, quando le colonne visibili sommavano
   * meno della finestra restava una fascia vuota a destra — e con la larghezza fissa le colonne
   * lunghe (Attività, Indirizzo) troncavano anche quando lo spazio c'era. `flex: 1 1 <base>` con
   * `minWidth: <base>` risolve entrambi: sotto la base non si scende mai, sopra si distribuisce
   * quello che avanza.
   */
  const stileColonna = (larghezza: number) => ({ flex: `1 1 ${larghezza}px`, minWidth: larghezza });

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] ${
        // Ingrandita l'altezza non si calcola: si prende quella che avanza. `min-h-0` perché un
        // figlio flex ha `min-height: auto` di default e si rifiuterebbe di rimpicciolirsi sotto
        // il contenuto — con 5.000 righe virtualizzate significa traboccare fuori dallo schermo.
        ingrandita ? 'flex min-h-0 flex-1' : ''
      }`}
    >
      <div
        ref={contenitore}
        className={`overflow-auto focus-within:outline-none ${ingrandita ? 'w-full' : ''}`}
        style={{ height: ingrandita ? '100%' : ALTEZZA_VISTA }}
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
              const dir = h.column.getIsSorted();
              return (
                <div
                  key={h.id}
                  role="columnheader"
                  aria-colindex={i + 2}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  style={stileColonna(col?.larghezza ?? 120)}
                  className="flex items-center gap-0.5 pl-2 pr-1"
                >
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    title={`Ordina per ${col?.intestazione ?? ''}`}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-[var(--radius-sm)] py-2 text-left hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  >
                    <span className="truncate">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </span>
                    {dir === 'asc' && <ArrowUp size={12} aria-hidden="true" />}
                    {dir === 'desc' && <ArrowDown size={12} aria-hidden="true" />}
                    {!dir && <ChevronsUpDown size={12} aria-hidden="true" className="opacity-40" />}
                  </button>
                  {col?.filtro && filtri && onFiltri && (
                    <FiltroColonna
                      intestazione={col.intestazione}
                      filtro={col.filtro}
                      filtri={filtri}
                      onChange={onFiltri}
                      valori={col.filtro.tipo === 'elenco' ? (opzioni?.[col.filtro.opzioni] ?? []) : []}
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
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={vi.index + 2}
                  aria-selected={scelta}
                  className={`absolute left-0 flex w-full border-b border-[var(--brand-border)] text-sm ${
                    scelta ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-[var(--brand-surface-muted)]'
                  }`}
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <div className="flex w-10 shrink-0 items-center justify-center" role="gridcell">
                    <input
                      type="checkbox"
                      aria-label={`Seleziona ordine ${r.odl}`}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                      checked={scelta}
                      onChange={() => clickRiga(vi.index, false)}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          e.preventDefault();
                          clickRiga(vi.index, true);
                        }
                      }}
                    />
                  </div>
                  {visibili.map((c, iCol) => {
                    const iEdit = editing?.indiceEditabile(c.chiave) ?? null;
                    const locale = editing?.valoreLocale(r, c.chiave) ?? null;
                    const testo = locale ?? valoreCella(r, c.chiave);
                    const evidenzia = c.chiave === 'scadenza';
                    const inFocus =
                      iEdit !== null && editing?.focus?.riga === vi.index && editing.focus.colonna === iEdit;
                    const inSelezione =
                      iEdit !== null && editing?.celleSelezionate.has(`${vi.index}:${iEdit}`);
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
                        style={stileColonna(c.larghezza)}
                        title={testo}
                        onMouseDown={
                          iEdit === null
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                editing?.onClickCella(vi.index, iEdit, e.shiftKey);
                                // `preventDefault` impedisce il focus di default, che senza questa
                                // riga restava sul `<body>`: il cursore ARIA non veniva letto e il
                                // Tab successivo ripartiva dall'inizio del documento.
                                griglia.current?.focus();
                              }
                        }
                        className={`truncate px-2 py-2 ${c.mono ? 'font-mono tabular-nums' : ''} ${
                          evidenzia ? TONO_CLASSE[tono] : 'text-[var(--brand-text-main)]'
                        } ${iEdit !== null ? 'cursor-cell' : ''} ${
                          inSelezione && !inFocus ? 'bg-[var(--brand-primary-soft)]' : ''
                        } ${
                          inFocus
                            ? 'outline outline-2 -outline-offset-2 outline-[var(--brand-primary)]'
                            : ''
                        } ${locale ? 'italic' : ''}`}
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
                            <span className="sr-only">
                              Matricola al limite dei 40 caratteri: da verificare.{' '}
                            </span>
                          </>
                        )}
                        {testo}
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
