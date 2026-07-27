'use client';

import { useMemo, useRef, useState } from 'react';
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

const TONO_CLASSE: Record<TonoScadenza, string> = {
  scaduto: 'text-[var(--danger)] font-semibold',
  oggi: 'text-[var(--warning)] font-semibold',
  vicino: 'text-[var(--warning)]',
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
  filtri, onFiltri, opzioni,
}: Props) {
  const [ordinamento, setOrdinamento] = useState<SortingState>([]);
  const contenitore = useRef<HTMLDivElement>(null);
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
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div
        ref={contenitore}
        className="overflow-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
        style={{ height: ALTEZZA_VISTA }}
        // Le celle non sono focalizzabili (sono `div` dentro una lista virtualizzata: darle al
        // tab significherebbe far tabulare 5.000 elementi). Il punto d'ingresso è il contenitore:
        // ci si arriva col tab, e la prima freccia o l'Invio porta il cursore sulla prima cella
        // modificabile. Prima si entrava SOLO col mouse, e senza mouse la pianificazione a griglia
        // era irraggiungibile.
        tabIndex={editing ? 0 : undefined}
        aria-label={
          editing
            ? 'Registro ordini. Premi una freccia per entrare nella griglia modificabile, Esc per uscirne.'
            : undefined
        }
        onKeyDown={(e) => {
          if (!editing || editing.focus || rows.length === 0) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) {
            e.preventDefault();
            editing.onClickCella(0, 0, false);
          }
        }}
      >
        {/* `+1`: nel conteggio ARIA la riga di intestazione è la riga 1, i dati partono da 2. */}
        <div
          role="grid"
          aria-rowcount={rows.length + 1}
          aria-colcount={visibili.length + 1}
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
                  {visibili.map((c) => {
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
                        style={stileColonna(c.larghezza)}
                        title={testo}
                        onMouseDown={
                          iEdit === null
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                editing?.onClickCella(vi.index, iEdit, e.shiftKey);
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
                          <TriangleAlert
                            size={12}
                            aria-label="Matricola al limite dei 40 caratteri: da verificare"
                            className="mr-1 inline text-[var(--warning)]"
                          />
                        )}
                        {testo}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

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
