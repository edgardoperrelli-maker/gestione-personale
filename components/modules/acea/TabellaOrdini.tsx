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

/** Altezza fissa di riga: serve al virtualizzatore per calcolare la finestra visibile. */
const ALTEZZA_RIGA = 36;
const ALTEZZA_VISTA = 560;

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
 */
export default function TabellaOrdini({
  righe, colonne, colonneVisibili, oggi, selezione, onSelezione, caricando = false,
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

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div ref={contenitore} className="overflow-auto" style={{ height: ALTEZZA_VISTA }}>
        <div style={{ width: larghezzaTotale, minWidth: '100%' }}>
          {/* intestazione */}
          <div className="sticky top-0 z-10 flex border-b border-[var(--brand-border-strong)] bg-[var(--brand-surface-muted)] text-xs font-semibold text-[var(--brand-text-muted)]">
            <div className="flex w-10 shrink-0 items-center justify-center">
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
              const dir = h.column.getIsSorted();
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={h.column.getToggleSortingHandler()}
                  style={{ width: visibili[i]?.larghezza }}
                  className="flex shrink-0 items-center gap-1 px-2 py-2 text-left hover:text-[var(--brand-text-main)]"
                >
                  <span className="truncate">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </span>
                  {dir === 'asc' && <ArrowUp size={12} aria-hidden="true" />}
                  {dir === 'desc' && <ArrowDown size={12} aria-hidden="true" />}
                  {!dir && <ChevronsUpDown size={12} aria-hidden="true" className="opacity-40" />}
                </button>
              );
            })}
          </div>

          {/* corpo virtualizzato */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const r = row.original;
              const tono = tonoScadenza(r, oggi);
              const scelta = Boolean(selezione[row.id]);
              return (
                <div
                  key={row.id}
                  className={`absolute left-0 flex w-full border-b border-[var(--brand-border)] text-sm ${
                    scelta ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-[var(--brand-surface-muted)]'
                  }`}
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <div className="flex w-10 shrink-0 items-center justify-center">
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
                    const testo = valoreCella(r, c.chiave);
                    const evidenzia = c.chiave === 'scadenza';
                    return (
                      <div
                        key={c.chiave}
                        style={{ width: c.larghezza }}
                        title={testo}
                        className={`shrink-0 truncate px-2 py-2 ${c.mono ? 'font-mono tabular-nums' : ''} ${
                          evidenzia ? TONO_CLASSE[tono] : 'text-[var(--brand-text-main)]'
                        }`}
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
