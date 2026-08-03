'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { STATI_MISURATORE, STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';
import { STATO_ACCENT, STATO_TESTO } from './StatoBadge';
import { formatItalian } from '@/utils/date-it';

type SortKey = 'data_esecuzione' | 'stato' | 'comune' | 'pallet';

interface Props {
  rows: MisuratoreRimosso[];
  onPatch: (id: string, patch: { stato?: StatoMisuratore; note?: string; pallet?: string }) => Promise<void>;
  /** Solo admin_plus può riportare indietro lo stato; gli altri possono solo avanzarlo. */
  isAdminPlus: boolean;
  /** Colonna PDR: il registro AcquaLatina non ne ha una (misuratori d'acqua). */
  mostraPdr?: boolean;
  /**
   * Colonna Pallet + spunte di selezione: a cesta piena si selezionano i misuratori che ci sono
   * finiti dentro e si assegna loro il numero del pallet, in blocco dalla barra del client —
   * oppure si scrive nella cella, una riga alla volta. Attiva su ENTRAMBE le commesse dal
   * 2026-08-03. Senza questa prop la tabella resta quella di sempre.
   */
  mostraPallet?: boolean;
  /** Id selezionati, posseduti dal client (la barra di assegnazione vive lì). */
  selezione?: ReadonlySet<string>;
  onSelezione?: (aggiorna: (prima: Set<string>) => Set<string>) => void;
  /**
   * Righe con una PATCH in volo: il loro select di stato si disabilita. Una scrittura per
   * riga alla volta — due cambi rapidi sulla stessa riga erano due PATCH senza ordine
   * garantito, e l'ottimistica poteva mostrare uno stato che il server non aveva.
   */
  salvando?: ReadonlySet<string>;
}

export default function MisuratoriTabella({
  rows, onPatch, isAdminPlus, mostraPdr = true,
  mostraPallet = false, selezione, onSelezione, salvando,
}: Props) {
  const [sortKey, setSortKey]         = useState<SortKey>('data_esecuzione');
  const [sortAsc, setSortAsc]         = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue]     = useState('');
  /** `true` per un solo giro: l'Escape ha annullato, il blur che segue non deve committare. */
  const annullaNota = useRef(false);
  /** La riga la cui nota è appena uscita dall'editor: il focus torna al suo bottone. */
  const notaAppenaChiusa = useRef<string | null>(null);

  /*
    Pallet scrivibile nella cella, stesse regole della nota (Escape annulla, niente PATCH a
    vuoto, il focus torna dov'era). Prima si poteva assegnare SOLO in blocco dalla barra della
    cesta: giusto per il gesto vero — «la cesta è piena, questi ci sono finiti dentro» — ma per
    correggere un numero su una riga sola costringeva a selezionarla, aprire la barra e
    riscrivere il pallet, cioè a rifare l'assegnazione per cambiare una cifra.
    Le due strade scrivono lo stesso campo e convivono.
  */
  const [editingPallet, setEditingPallet] = useState<string | null>(null);
  const [palletValue, setPalletValue]     = useState('');
  const annullaPallet = useRef(false);
  const palletAppenaChiuso = useRef<string | null>(null);

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
    async (id: string, notaOriginale: string | null) => {
      // Guard di rientro: su Invio l'editor si smonta e il blur che segue richiamerebbe il
      // commit una seconda volta — due PATCH identiche per un solo gesto.
      if (editingNote !== id) return;
      setEditingNote(null);
      notaAppenaChiusa.current = id;
      // Nessuna modifica = nessuna PATCH: aprire la nota e cliccare fuori non è un salvataggio,
      // e ogni PATCH a vuoto muoveva `updated_at` sul server.
      if (noteValue === (notaOriginale ?? '')) return;
      await onPatch(id, { note: noteValue });
    },
    [onPatch, noteValue, editingNote]
  );

  const startPalletEdit = useCallback((row: MisuratoreRimosso) => {
    setEditingPallet(row.id);
    setPalletValue(row.pallet ?? '');
  }, []);

  const commitPallet = useCallback(
    // `undefined` ammesso: il registro ACEA non ha la colonna, e il tipo condiviso lo riflette.
    async (id: string, palletOriginale: string | null | undefined) => {
      // Stessa guardia di rientro della nota: su Invio l'editor si smonta e il blur che segue
      // richiamerebbe il commit una seconda volta.
      if (editingPallet !== id) return;
      setEditingPallet(null);
      palletAppenaChiuso.current = id;
      const pulito = palletValue.trim();
      if (pulito === (palletOriginale ?? '').trim()) return;
      // Stringa vuota = TOGLIE il pallet (il server la traduce in NULL): è la correzione di un
      // errore, e «ancora in cesta» è uno stato legittimo — non serve un secondo verbo.
      await onPatch(id, { pallet: pulito });
    },
    [onPatch, palletValue, editingPallet],
  );

  /*
    Il focus torna al bottone della cella appena l'editor si smonta — su commit E su
    annullamento. Senza, cadeva sul body e il giro di Tab ripartiva dall'inizio della pagina:
    per chi lavora di tastiera, ogni valore salvato costava la traversata del modulo.
    Una funzione sola per le due colonne: due copie sarebbero divergute alla prima modifica.
  */
  const tornaAlBottone = (selettore: string, riferimento: { current: string | null }) => {
    if (!riferimento.current) return;
    const btn = document.querySelector<HTMLButtonElement>(
      `[${selettore}="${CSS.escape(riferimento.current)}"]`,
    );
    riferimento.current = null;
    btn?.focus();
  };

  useEffect(() => {
    if (editingNote !== null) return;
    tornaAlBottone('data-nota-btn', notaAppenaChiusa);
  }, [editingNote]);

  useEffect(() => {
    if (editingPallet !== null) return;
    tornaAlBottone('data-pallet-btn', palletAppenaChiuso);
  }, [editingPallet]);

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortAsc
          ? <ArrowUp className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />
          : <ArrowDown className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />)
      : null;

  const conSpunte = mostraPallet && onSelezione !== undefined;
  const spuntate = selezione ?? new Set<string>();
  const visibiliSpuntate = conSpunte ? sorted.filter((r) => spuntate.has(r.id)).length : 0;
  const tutteSpuntate = conSpunte && sorted.length > 0 && visibiliSpuntate === sorted.length;

  const toggleRiga = useCallback((id: string) => {
    onSelezione?.((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(id)) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });
  }, [onSelezione]);

  // La spunta di testa lavora sulle righe VISIBILI (filtri e ordinamento correnti): «tutta la
  // cesta» nella pratica è «tutto ciò che ho davanti dopo aver filtrato».
  const toggleTutte = useCallback(() => {
    onSelezione?.((prima) => {
      const dopo = new Set(prima);
      const visibili = sorted.map((r) => r.id);
      const giaTutte = visibili.length > 0 && visibili.every((id) => dopo.has(id));
      if (giaTutte) visibili.forEach((id) => dopo.delete(id));
      else visibili.forEach((id) => dopo.add(id));
      return dopo;
    });
  }, [onSelezione, sorted]);

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun misuratore trovato con i filtri selezionati.
      </p>
    );
  }

  return (
    <table
      aria-label="Registro dei misuratori rimossi"
      className="min-w-full divide-y divide-[var(--brand-border)] text-sm"
    >
      <thead className="sticky top-0 z-10 bg-[var(--brand-surface-muted)]">
        <tr>
            {conSpunte && (
              <th scope="col" className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={tutteSpuntate}
                  /*
                    `indeterminate` a selezione parziale: si scrive solo via DOM, e senza il
                    quadratino diceva «niente di selezionato» con trenta spunte sotto i filtri.
                  */
                  ref={(el) => {
                    if (el) el.indeterminate = !tutteSpuntate && visibiliSpuntate > 0;
                  }}
                  onChange={toggleTutte}
                  aria-label="Seleziona tutti i misuratori visibili"
                  title="Seleziona tutti i visibili (con i filtri correnti)"
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                />
              </th>
            )}
            {(
              [
                { key: null,              label: 'ODS/ODL' },
                { key: 'data_esecuzione', label: 'Data' },
                { key: null,              label: 'Esecutore' },
                { key: null,              label: 'Indirizzo' },
                { key: 'comune',          label: 'Comune' },
                { key: null,              label: 'Matricola' },
                ...(mostraPdr ? [{ key: null, label: 'PDR' }] : []),
                ...(mostraPallet ? [{ key: 'pallet' as SortKey, label: 'Pallet' }] : []),
                { key: 'stato',           label: 'Stato' },
                { key: null,              label: 'Note' },
              ] as Array<{ key: SortKey | null; label: string }>
            ).map(({ key, label }) => (
              /*
                L'ordinamento sta su un VERO <button> dentro il th, non su un onClick del th:
                col solo click la tastiera non ci arrivava mai (niente Tab, niente Invio) e il
                lettore di schermo non sentiva né il comando né il verso. `aria-sort` sul th
                dice il verso corrente, come in TabellaOrdini.
              */
              <th
                key={label}
                scope="col"
                aria-sort={key && sortKey === key ? (sortAsc ? 'ascending' : 'descending') : undefined}
                className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--brand-text-muted)]"
              >
                {key ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    title={`Ordina per ${label}`}
                    className="inline-flex select-none items-center gap-0.5 rounded-[var(--radius-sm)] uppercase tracking-wide hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  >
                    {label}<SortArrow k={key} />
                  </button>
                ) : label}
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
              className={`transition-colors hover:bg-[var(--brand-surface-muted)]${
                conSpunte && spuntate.has(row.id) ? ' bg-[var(--brand-primary-soft)]' : ''
              }`}
            >
              {conSpunte && (
                <td className="w-8 px-3 py-2" style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}>
                  <input
                    type="checkbox"
                    checked={spuntate.has(row.id)}
                    onChange={() => toggleRiga(row.id)}
                    aria-label={`Seleziona misuratore ${row.matricola}`}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                </td>
              )}
              <td
                className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums"
                style={conSpunte ? undefined : { boxShadow: `inset 3px 0 0 0 ${accent}` }}
              >{row.odl ?? '—'}</td>
              {/* `text-xs` come OGNI cella-dato mono della riga (ODL, Matricola, PDR, Pallet):
                  era l'unica a 14, e i dati densi stanno al gradino 12 (§4). */}
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">{formatItalian(row.data_esecuzione)}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.esecutore ?? '—'}</td>
              <td className="max-w-[180px] truncate px-3 py-2" title={row.indirizzo ?? undefined}>{row.indirizzo ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2">{row.comune ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">{row.matricola}</td>
              {mostraPdr && (
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">{row.pdr ?? '—'}</td>
              )}
              {mostraPallet && (
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums">
                  {editingPallet === row.id ? (
                    <input
                      autoFocus
                      value={palletValue}
                      onChange={e => setPalletValue(e.target.value)}
                      aria-label={`Pallet per il misuratore ${row.matricola}`}
                      /*
                        `inputMode` e non `type="number"`: il pallet è un RIFERIMENTO, non una
                        quantità. Col campo numerico gli zeri di testa sparirebbero e le frecce
                        del mouse potrebbero cambiarlo per sbaglio scorrendo la tabella.
                      */
                      inputMode="numeric"
                      onBlur={() => {
                        if (annullaPallet.current) { annullaPallet.current = false; return; }
                        void commitPallet(row.id, row.pallet);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitPallet(row.id, row.pallet);
                        if (e.key === 'Escape') {
                          annullaPallet.current = true;
                          palletAppenaChiuso.current = row.id;
                          setEditingPallet(null);
                        }
                      }}
                      className="w-20 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-0.5 font-mono text-xs tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    />
                  ) : (
                    <button
                      type="button"
                      data-pallet-btn={row.id}
                      aria-label={`Modifica pallet per il misuratore ${row.matricola}`}
                      onClick={() => startPalletEdit(row)}
                      className="w-full cursor-text rounded-[var(--radius-sm)] text-left font-mono text-xs tabular-nums text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                      title="Clicca per scrivere il numero del pallet"
                    >
                      {row.pallet?.trim() || '—'}
                    </button>
                  )}
                </td>
              )}

              {/* Dropdown stato inline */}
              <td className="whitespace-nowrap px-3 py-2">
                <select
                  /*
                    Il vincolo di regressione DETTO anche a chi non ha il mouse: il `title` lo
                    vede solo l'hover, e per un lettore di schermo le opzioni disabilitate
                    senza motivo sono un mistero.
                  */
                  aria-label={`Stato misuratore ${row.matricola}${
                    isAdminPlus ? '' : '. Solo Admin Plus può riportare indietro lo stato'}`}
                  value={row.stato}
                  onChange={e => handleStatoChange(row.id, e.target.value as StatoMisuratore)}
                  // Una scrittura per riga alla volta: chiude la corsa fra PATCH concorrenti.
                  disabled={salvando?.has(row.id)}
                  title={isAdminPlus ? undefined : 'Solo Admin Plus può riportare indietro lo stato'}
                  /*
                    Il TESTO usa `STATO_TESTO`, non l'accent nudo: `--status-idle` è un token
                    da pallini (0.62) e come testo a 12px faceva 3,64:1 — sotto l'AA. Bordo e
                    rail restano sull'accent, dove il colore è segnale e non lettura. Peso in
                    classe (`font-medium`, §4): uno style inline sfugge alle bonifiche.
                  */
                  style={{ color: STATO_TESTO[row.stato], borderColor: accent }}
                  className="rounded-[var(--radius-sm)] border bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:cursor-wait disabled:opacity-60"
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
                    aria-label={`Note per ${row.matricola}`}
                    /*
                      Escape = ANNULLA: prima non c'era via d'uscita — qualunque uscita
                      committava, refuso compreso. Il flag ferma il blur che l'unmount
                      dell'editor fa scattare subito dopo.
                    */
                    onBlur={() => {
                      if (annullaNota.current) { annullaNota.current = false; return; }
                      void commitNote(row.id, row.note);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitNote(row.id, row.note);
                      if (e.key === 'Escape') {
                        annullaNota.current = true;
                        notaAppenaChiusa.current = row.id;
                        setEditingNote(null);
                      }
                    }}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  />
                ) : (
                  /*
                    Un VERO bottone, non uno span con role="button": quello prometteva un
                    comando che la tastiera non trovava — niente tabIndex, niente Invio/Spazio.
                    Il bottone nativo porta tutto da sé; l'aspetto resta quello del testo.
                    `data-nota-btn`: bersaglio del ritorno del focus a editor chiuso.
                  */
                  <button
                    type="button"
                    data-nota-btn={row.id}
                    aria-label={`Modifica note per ${row.matricola}`}
                    onClick={() => startNoteEdit(row)}
                    className="w-full cursor-text rounded-[var(--radius-sm)] text-left text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    title="Clicca per modificare"
                  >
                    {row.note || '—'}
                  </button>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
    </table>
  );
}
