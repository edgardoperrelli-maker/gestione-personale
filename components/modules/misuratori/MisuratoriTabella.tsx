'use client';
import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { STATI_MISURATORE, STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';
import { STATO_ACCENT } from './StatoBadge';
import { formatItalian } from '@/utils/date-it';

type SortKey = 'data_esecuzione' | 'stato' | 'comune';

interface Props {
  rows: MisuratoreRimosso[];
  onPatch: (id: string, patch: { stato?: StatoMisuratore; note?: string }) => Promise<void>;
  /** Solo admin_plus può riportare indietro lo stato; gli altri possono solo avanzarlo. */
  isAdminPlus: boolean;
  /** Colonna PDR: il registro AcquaLatina non ne ha una (misuratori d'acqua). */
  mostraPdr?: boolean;
}

export default function MisuratoriTabella({ rows, onPatch, isAdminPlus, mostraPdr = true }: Props) {
  const [sortKey, setSortKey]         = useState<SortKey>('data_esecuzione');
  const [sortAsc, setSortAsc]         = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue]     = useState('');

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string;
      const bv = (b[sortKey] ?? '') as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortKey, sortAsc]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }, [sortKey]);

  const handleStatoChange = useCallback(
    async (id: string, stato: StatoMisuratore) => {
      await onPatch(id, { stato });
    },
    [onPatch]
  );

  const startNoteEdit = useCallback((row: MisuratoreRimosso) => {
    setEditingNote(row.id);
    setNoteValue(row.note ?? '');
  }, []);

  const commitNote = useCallback(
    async (id: string) => {
      await onPatch(id, { note: noteValue });
      setEditingNote(null);
    },
    [onPatch, noteValue]
  );

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortAsc
          ? <ArrowUp className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />
          : <ArrowDown className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />)
      : null;

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun misuratore trovato con i filtri selezionati.
      </p>
    );
  }

  return (
    <table className="min-w-full divide-y divide-[var(--brand-border)] text-sm">
      <thead className="sticky top-0 z-10 bg-[var(--brand-surface-muted)]">
        <tr>
            {(
              [
                { key: null,              label: 'ODS/ODL' },
                { key: 'data_esecuzione', label: 'Data' },
                { key: null,              label: 'Esecutore' },
                { key: null,              label: 'Indirizzo' },
                { key: 'comune',          label: 'Comune' },
                { key: null,              label: 'Matricola' },
                ...(mostraPdr ? [{ key: null, label: 'PDR' }] : []),
                { key: 'stato',           label: 'Stato' },
                { key: null,              label: 'Note' },
              ] as Array<{ key: SortKey | null; label: string }>
            ).map(({ key, label }) => (
              <th
                key={label}
                onClick={key ? () => toggleSort(key) : undefined}
                className={`whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--brand-text-muted)]${key ? ' cursor-pointer select-none hover:text-[var(--brand-text-main)]' : ''}`}
              >
                {label}{key && <SortArrow k={key} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--brand-border)]">
          {sorted.map(row => {
            const accent = STATO_ACCENT[row.stato];
            return (
            <tr
              key={row.id}
              className="transition-colors hover:bg-[var(--brand-surface-muted)]"
            >
              <td
                className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums"
                style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
              >{row.odl ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">{formatItalian(row.data_esecuzione)}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.esecutore ?? '—'}</td>
              <td className="max-w-[180px] truncate px-3 py-2" title={row.indirizzo ?? undefined}>{row.indirizzo ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.comune ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">{row.matricola}</td>
              {mostraPdr && (
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">{row.pdr ?? '—'}</td>
              )}

              {/* Dropdown stato inline */}
              <td className="whitespace-nowrap px-3 py-2">
                <select
                  aria-label={`Stato misuratore ${row.matricola}`}
                  value={row.stato}
                  onChange={e => handleStatoChange(row.id, e.target.value as StatoMisuratore)}
                  title={isAdminPlus ? undefined : 'Solo Admin Plus può riportare indietro lo stato'}
                  style={{ color: accent, borderColor: accent, fontWeight: 600 }}
                  className="rounded-[var(--radius-sm)] border bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  {STATI_MISURATORE.map((s, i) => (
                    <option
                      key={s}
                      value={s}
                      disabled={!isAdminPlus && i < STATI_MISURATORE.indexOf(row.stato)}
                    >
                      {STATO_LABEL[s]}
                    </option>
                  ))}
                </select>
              </td>

              {/* Note editabili inline */}
              <td className="min-w-[140px] px-3 py-2">
                {editingNote === row.id ? (
                  <input
                    autoFocus
                    value={noteValue}
                    onChange={e => setNoteValue(e.target.value)}
                    onBlur={() => commitNote(row.id)}
                    onKeyDown={e => e.key === 'Enter' && commitNote(row.id)}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  />
                ) : (
                  <span
                    role="button"
                    aria-label={`Modifica note per ${row.matricola}`}
                    onClick={() => startNoteEdit(row)}
                    className="cursor-text text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]"
                    title="Clicca per modificare"
                  >
                    {row.note || '—'}
                  </span>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
    </table>
  );
}
