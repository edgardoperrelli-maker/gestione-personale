'use client';
import { useCallback, useMemo, useState } from 'react';
import { STATI_MISURATORE, STATO_LABEL, STATO_ROW_TINT, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';
import { formatItalian } from '@/utils/date-it';

type SortKey = 'data_esecuzione' | 'stato' | 'comune';

interface Props {
  rows: MisuratoreRimosso[];
  onPatch: (id: string, patch: { stato?: StatoMisuratore; note?: string }) => Promise<void>;
  /** Solo admin_plus può riportare indietro lo stato; gli altri possono solo avanzarlo. */
  isAdminPlus: boolean;
}

export default function MisuratoriTabella({ rows, onPatch, isAdminPlus }: Props) {
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
    sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun misuratore trovato con i filtri selezionati.
      </p>
    );
  }

  return (
    <table className="min-w-full divide-y divide-[var(--brand-border)] text-sm">
      <thead className="sticky top-0 z-10 bg-[var(--brand-surface)]">
        <tr>
            {(
              [
                { key: null,              label: 'ODS/ODL' },
                { key: 'data_esecuzione', label: 'Data' },
                { key: null,              label: 'Esecutore' },
                { key: null,              label: 'Indirizzo' },
                { key: 'comune',          label: 'Comune' },
                { key: null,              label: 'Matricola' },
                { key: null,              label: 'PDR' },
                { key: 'stato',           label: 'Stato' },
                { key: null,              label: 'Note' },
              ] as Array<{ key: SortKey | null; label: string }>
            ).map(({ key, label }) => (
              <th
                key={label}
                onClick={key ? () => toggleSort(key) : undefined}
                className={`px-3 py-2 text-left font-medium text-[var(--brand-text-muted)] uppercase tracking-wide text-xs whitespace-nowrap${key ? ' cursor-pointer select-none hover:text-[var(--brand-text-main)]' : ''}`}
              >
                {label}{key && <SortArrow k={key} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--brand-border)] bg-[var(--brand-bg)]">
          {sorted.map(row => (
            <tr
              key={row.id}
              className="transition-colors hover:bg-[var(--brand-surface)]"
              style={STATO_ROW_TINT[row.stato] ? { backgroundColor: STATO_ROW_TINT[row.stato]!.bg } : undefined}
            >
              <td
                className="px-3 py-2 font-mono text-xs whitespace-nowrap"
                style={STATO_ROW_TINT[row.stato] ? { boxShadow: `inset 4px 0 0 0 ${STATO_ROW_TINT[row.stato]!.accent}` } : undefined}
              >{row.odl ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatItalian(row.data_esecuzione)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.esecutore ?? '—'}</td>
              <td className="px-3 py-2 max-w-[180px] truncate">{row.indirizzo ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.comune ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.matricola}</td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.pdr ?? '—'}</td>

              {/* Dropdown stato inline */}
              <td className="px-3 py-2 whitespace-nowrap">
                <select
                  aria-label={`Stato misuratore ${row.matricola}`}
                  value={row.stato}
                  onChange={e => handleStatoChange(row.id, e.target.value as StatoMisuratore)}
                  title={isAdminPlus ? undefined : 'Solo Admin Plus può riportare indietro lo stato'}
                  style={STATO_ROW_TINT[row.stato] ? { color: STATO_ROW_TINT[row.stato]!.accent, borderColor: STATO_ROW_TINT[row.stato]!.accent, fontWeight: 600 } : undefined}
                  className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
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
              <td className="px-3 py-2 min-w-[140px]">
                {editingNote === row.id ? (
                  <input
                    autoFocus
                    value={noteValue}
                    onChange={e => setNoteValue(e.target.value)}
                    onBlur={() => commitNote(row.id)}
                    onKeyDown={e => e.key === 'Enter' && commitNote(row.id)}
                    className="w-full rounded border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none"
                  />
                ) : (
                  <span
                    role="button"
                    aria-label={`Modifica note per ${row.matricola}`}
                    onClick={() => startNoteEdit(row)}
                    className="cursor-text text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] italic"
                    title="Clicca per modificare"
                  >
                    {row.note || '—'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
    </table>
  );
}
