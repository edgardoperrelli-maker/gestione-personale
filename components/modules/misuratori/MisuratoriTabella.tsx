'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { STATI_MISURATORE, STATO_LABEL, type MisuratoreRimosso, type StatoMisuratore } from '@/types/misuratori';
import { STATO_ACCENT, STATO_TESTO } from './StatoBadge';
import { useGrigliaCopiabile } from '@/components/ui/useGrigliaCopiabile';
import { formatItalian } from '@/utils/date-it';

type SortKey = 'data_esecuzione' | 'stato' | 'comune' | 'cesta';

interface Props {
  rows: MisuratoreRimosso[];
  onPatch: (id: string, patch: { stato?: StatoMisuratore; note?: string; cesta?: string }) => Promise<void>;
  /** Solo admin_plus può riportare indietro lo stato; gli altri possono solo avanzarlo. */
  isAdminPlus: boolean;
  /** Colonna PDR: il registro AcquaLatina non ne ha una (misuratori d'acqua). */
  mostraPdr?: boolean;
  /**
   * Colonna Cesta + spunte di selezione. La cesta è il contenitore numerato con cui la
   * riconsegna viaggia: si assegna in blocco dalla barra del client — «questi sono finiti nella
   * stessa cesta» — oppure si scrive nella cella, una riga alla volta.
   * Su AcquaLatina il numero lo dichiara l'OPERATORE all'invio del rapportino e qui si CORREGGE,
   * perché un numero sbagliato di sera è un contatore cercato nella cesta sbagliata e il
   * rapportino è ormai chiuso. Senza questa prop la tabella resta quella di sempre.
   */
  mostraCesta?: boolean;
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
  rows, onPatch, isAdminPlus, mostraPdr = true, mostraCesta = false,
  selezione, onSelezione, salvando,
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
    Cesta scrivibile nella cella, stesse regole della nota (Escape annulla, niente PATCH a
    vuoto, il focus torna dov'era). Si può assegnare anche in blocco dalla barra della
    selezione: giusto per il gesto vero — «questi sono finiti nella stessa cesta» — ma per
    correggere un numero su una riga sola costringeva a selezionarla, aprire la barra e
    riscrivere il numero, cioè a rifare l'assegnazione per cambiare una cifra.
    Le due strade scrivono lo stesso campo e convivono.
  */
  const [editingCesta, setEditingCesta] = useState<string | null>(null);
  const [cestaValue, setCestaValue]     = useState('');
  const annullaCesta = useRef(false);
  const cestaAppenaChiusa = useRef<string | null>(null);

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

  /*
    Il MODELLO delle colonne: intestazione, chiave d'ordinamento e testo da copiare, in un posto
    solo. Prima l'intestazione era un array inline e il corpo una sequenza di <td> scritti a
    mano: due liste parallele che con PDR e Cesta condizionali erano già a rischio di sfalsarsi,
    e che una terza lista (i valori da copiare) avrebbe reso ingestibili.

    Il valore è il testo che si VEDE — data all'italiana, stato in chiaro — non il dato grezzo:
    chi copia una riga la incolla in un foglio da leggere, non in un database.
  */
  const colonne = useMemo(() => {
    const c: Array<{ label: string; key: SortKey | null; valore: (r: MisuratoreRimosso) => string }> = [
      { label: 'ODS/ODL',   key: null,              valore: r => r.odl ?? '' },
      { label: 'Data',      key: 'data_esecuzione', valore: r => formatItalian(r.data_esecuzione) },
      { label: 'Esecutore', key: null,              valore: r => r.esecutore ?? '' },
      { label: 'Indirizzo', key: null,              valore: r => r.indirizzo ?? '' },
      { label: 'Comune',    key: 'comune',          valore: r => r.comune ?? '' },
      { label: 'Matricola', key: null,              valore: r => r.matricola },
    ];
    if (mostraPdr) c.push({ label: 'PDR', key: null, valore: r => r.pdr ?? '' });
    if (mostraCesta) c.push({ label: 'Cesta', key: 'cesta', valore: r => r.cesta?.trim() ?? '' });
    c.push({ label: 'Stato', key: 'stato', valore: r => STATO_LABEL[r.stato] });
    c.push({ label: 'Note',  key: null,    valore: r => r.note ?? '' });
    return c;
  }, [mostraPdr, mostraCesta]);

  /** Indice di una colonna per etichetta: le celle non contano le posizioni a mano. */
  const iCol = useCallback((label: string) => colonne.findIndex(c => c.label === label), [colonne]);

  /*
    Celle copiabili, come nel registro ordini: si clicca, si estende con shift o con le frecce,
    Ctrl+C e il blocco è in Excel. Qui non si incolla — questa tabella ha i suoi editor per
    cella, e il gancio si ferma sulla soglia di qualunque campo abbia il fuoco.
  */
  const griglia = useGrigliaCopiabile({
    righe: sorted.length,
    colonne: colonne.map(c => c.label),
    valoreCella: (r, c) => {
      const riga = sorted[r];
      return riga ? (colonne[c]?.valore(riga) ?? '') : '';
    },
  });

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

  const startCestaEdit = useCallback((row: MisuratoreRimosso) => {
    setEditingCesta(row.id);
    setCestaValue(row.cesta ?? '');
  }, []);

  const commitCesta = useCallback(
    // `undefined` ammesso: il tipo condiviso porta la cesta come opzionale, perché il registro
    // resta vivo anche prima che la migration della colonna sia passata (`selectDegradante`).
    async (id: string, cestaOriginale: string | null | undefined) => {
      if (editingCesta !== id) return;
      setEditingCesta(null);
      cestaAppenaChiusa.current = id;
      const pulito = cestaValue.trim();
      if (pulito === (cestaOriginale ?? '').trim()) return;
      // Stringa vuota = TOGLIE la cesta: è la correzione di un «l'ho scaricato» dato per
      // sbaglio, e «ancora in furgone» è uno stato legittimo.
      await onPatch(id, { cesta: pulito });
    },
    [onPatch, cestaValue, editingCesta],
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
    if (editingCesta !== null) return;
    tornaAlBottone('data-cesta-btn', cestaAppenaChiusa);
  }, [editingCesta]);

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortAsc
          ? <ArrowUp className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />
          : <ArrowDown className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />)
      : null;

  const conSpunte = mostraCesta && onSelezione !== undefined;
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

  // La spunta di testa lavora sulle righe VISIBILI (filtri e ordinamento correnti): «tutte
  // queste» nella pratica è «tutto ciò che ho davanti dopo aver filtrato».
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

  /*
    Chiavi d'ordinamento esposte come pillole: la tabella si ordina dalle intestazioni, le
    schede non ne hanno una — senza questa riga, sotto md non si potrebbe ordinare affatto.
    Le stesse chiavi della tabella (`SortKey`), stesso stato: una sola sorgente.
  */
  const ordinabili: Array<{ key: SortKey; label: string }> = [
    { key: 'data_esecuzione', label: 'Data' },
    { key: 'stato', label: 'Stato' },
    { key: 'comune', label: 'Comune' },
    ...(mostraCesta ? ([{ key: 'cesta', label: 'Cesta' }] as Array<{ key: SortKey; label: string }>) : []),
  ];

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun misuratore trovato con i filtri selezionati.
      </p>
    );
  }

  return (
    <>
      {/*
        TELEFONO — una scheda per misuratore. La tabella qui sotto ha dieci colonne: su 428px
        sono ~1200px di scorrimento laterale e celle da 20px, cioè un registro che si legge
        con due dita e si modifica per sbaglio. La scheda porta in alto la MATRICOLA (è la
        chiave con cui si cerca un contatore in mano) e lo stato, sotto il resto in ordine di
        utilità. Stessi handler della tabella — nessuna logica duplicata, e valgono per
        entrambi i registri (ACEA e AcquaLatina montano questo stesso componente).
      */}
      <div className="md:hidden">
        <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2 pt-1">
          <span className="text-xs text-[var(--brand-text-subtle)]">Ordina</span>
          {ordinabili.map(({ key, label }) => {
            const attiva = sortKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                aria-pressed={attiva}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                  attiva
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] font-semibold text-white'
                    : 'border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-muted)]'
                }`}
              >
                {label}
                {attiva && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            );
          })}
        </div>

        <ul className="space-y-2 pb-2">
          {sorted.map((row) => {
            const accent = STATO_ACCENT[row.stato];
            const scelta = spuntate.has(row.id);
            return (
              <li
                key={row.id}
                style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
                className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)] px-3 py-2.5 pl-4 ${
                  scelta ? 'bg-[var(--brand-primary-soft)]' : 'bg-[var(--brand-surface)]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {conSpunte && (
                    // 44px di bersaglio col padding: la spunta è il gesto dell'assegnazione
                    // in blocco, e a 16px nuda sul telefono si manca.
                    <label className="-m-1.5 shrink-0 cursor-pointer p-1.5">
                      <input
                        type="checkbox"
                        checked={scelta}
                        onChange={() => toggleRiga(row.id)}
                        aria-label={`Seleziona misuratore ${row.matricola}`}
                        className="h-4 w-4 accent-[var(--brand-primary)]"
                      />
                    </label>
                  )}
                  {/* `truncate`: le matricole AcquaLatina arrivano anche in forma lunga
                      (`SETA071225203189`) e senza taglio finivano addosso alla pastiglia. */}
                  <span className="min-w-0 flex-1 truncate font-mono text-lg tabular-nums leading-tight text-[var(--brand-text-main)]">
                    {row.matricola}
                  </span>
                  {/*
                    Lo stato resta un <select> nativo: su iOS apre la ruota a tutto schermo,
                    che è il miglior selettore che il telefono abbia — e porta con sé le
                    stesse regole di regressione della tabella (le opzioni all'indietro sono
                    disabilitate se non sei Admin Plus).
                  */}
                  <select
                    aria-label={`Stato misuratore ${row.matricola}${
                      isAdminPlus ? '' : '. Solo Admin Plus può riportare indietro lo stato'}`}
                    value={row.stato}
                    onChange={e => handleStatoChange(row.id, e.target.value as StatoMisuratore)}
                    disabled={salvando?.has(row.id)}
                    style={{ color: STATO_TESTO[row.stato], borderColor: accent }}
                    className="max-w-[46%] shrink-0 truncate rounded-full border bg-[var(--brand-surface)] px-2.5 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:cursor-wait disabled:opacity-60"
                  >
                    {STATI_MISURATORE.map((s, i) => (
                      <option key={s} value={s} disabled={!isAdminPlus && i < STATI_MISURATORE.indexOf(row.stato)}>
                        {STATO_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="mt-1 truncate text-sm text-[var(--brand-text-main)]" title={row.indirizzo ?? undefined}>
                  {row.indirizzo ?? '—'}
                </p>
                {/* Riga di contorno: chi, dove e quando. `PDR` solo dove esiste (ACEA). */}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-[var(--brand-text-subtle)]">
                  <span>{row.comune ?? '—'}</span>
                  <span aria-hidden>·</span>
                  <span>{formatItalian(row.data_esecuzione)}</span>
                  <span aria-hidden>·</span>
                  <span>{row.esecutore ?? '—'}</span>
                  {mostraPdr && row.pdr && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">PDR {row.pdr}</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span className="font-mono">ODL {row.odl ?? '—'}</span>
                </p>

                {/* Le due celle scrivibili, come bottoni a piena riga: stessi commit della tabella. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--brand-border)] pt-1.5 text-xs">
                  {mostraCesta && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[var(--brand-text-subtle)]">Cesta</span>
                      {editingCesta === row.id ? (
                        <input
                          autoFocus
                          value={cestaValue}
                          onChange={e => setCestaValue(e.target.value)}
                          aria-label={`Cesta per il misuratore ${row.matricola}`}
                          inputMode="numeric"
                          disabled={salvando?.has(row.id)}
                          onBlur={() => {
                            if (annullaCesta.current) { annullaCesta.current = false; return; }
                            void commitCesta(row.id, row.cesta);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitCesta(row.id, row.cesta);
                            if (e.key === 'Escape') {
                              annullaCesta.current = true;
                              cestaAppenaChiusa.current = row.id;
                              setEditingCesta(null);
                            }
                          }}
                          className="w-16 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-1 font-mono text-xs tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:cursor-wait disabled:opacity-60"
                        />
                      ) : (
                        <button
                          type="button"
                          data-cesta-btn={row.id}
                          aria-label={`Modifica cesta per il misuratore ${row.matricola}`}
                          onClick={() => {
                            if (salvando?.has(row.id)) return;
                            startCestaEdit(row);
                          }}
                          aria-disabled={salvando?.has(row.id)}
                          className="-my-1 rounded-[var(--radius-sm)] px-1.5 py-1 font-mono text-xs tabular-nums text-[var(--brand-text-main)] underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] aria-disabled:cursor-wait aria-disabled:opacity-60"
                        >
                          {row.cesta?.trim() || '—'}
                        </button>
                      )}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="shrink-0 text-[var(--brand-text-subtle)]">Nota</span>
                    {editingNote === row.id ? (
                      <input
                        autoFocus
                        value={noteValue}
                        onChange={e => setNoteValue(e.target.value)}
                        aria-label={`Note per ${row.matricola}`}
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
                        className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                      />
                    ) : (
                      <button
                        type="button"
                        data-nota-btn={row.id}
                        aria-label={`Modifica note per ${row.matricola}`}
                        onClick={() => startNoteEdit(row)}
                        className="-my-1 min-w-0 flex-1 truncate rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-xs text-[var(--brand-text-main)] underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                      >
                        {row.note || '—'}
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <table
        aria-label="Registro dei misuratori rimossi"
        className="hidden min-w-full divide-y divide-[var(--brand-border)] text-sm md:table"
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
            {colonne.map(({ key, label }) => (
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
          {sorted.map((row, iRiga) => {
            const accent = STATO_ACCENT[row.stato];
            /* Props + classi di una cella copiabile, per etichetta di colonna. */
            const cella = (label: string) => {
              const c = iCol(label);
              return { props: griglia.propsCella(iRiga, c), classe: griglia.classeCella(iRiga, c) };
            };
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
                {...cella('ODS/ODL').props}
                className={`whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums ${cella('ODS/ODL').classe}`}
                style={conSpunte ? undefined : { boxShadow: `inset 3px 0 0 0 ${accent}` }}
              >{row.odl ?? '—'}</td>
              {/* `text-xs` come OGNI cella-dato mono della riga (ODL, Matricola, PDR, Cesta):
                  era l'unica a 14, e i dati densi stanno al gradino 12 (§4). */}
              <td {...cella('Data').props} className={`whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums ${cella('Data').classe}`}>{formatItalian(row.data_esecuzione)}</td>
              <td {...cella('Esecutore').props} className={`whitespace-nowrap px-3 py-2 ${cella('Esecutore').classe}`}>{row.esecutore ?? '—'}</td>
              {/* `title` con l'indirizzo intero: la cella tronca, ma la copia porta via il testo pieno. */}
              <td {...cella('Indirizzo').props} className={`max-w-[180px] truncate px-3 py-2 ${cella('Indirizzo').classe}`} title={row.indirizzo ?? undefined}>{row.indirizzo ?? '—'}</td>
              <td {...cella('Comune').props} className={`whitespace-nowrap px-3 py-2 ${cella('Comune').classe}`}>{row.comune ?? '—'}</td>
              <td {...cella('Matricola').props} className={`whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums ${cella('Matricola').classe}`}>{row.matricola}</td>
              {mostraPdr && (
                <td {...cella('PDR').props} className={`whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums ${cella('PDR').classe}`}>{row.pdr ?? '—'}</td>
              )}
              {mostraCesta && (
                <td {...cella('Cesta').props} className={`whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums ${cella('Cesta').classe}`}>
                  {/*
                    Riga alla volta, non cella alla volta: il server legge lo stato PRIMA di
                    scrivere la cesta (statoDopoCesta in aggiornaRegistro), e una seconda PATCH
                    sulla stessa riga partita durante il volo della prima può leggere uno stato non
                    ancora aggiornato e atterrare dopo, riscrivendo la cesta sopra l'esito della
                    prima — invariante rotto dal ramo che dovrebbe difenderlo. `salvando` è ciò su
                    cui poggia la serializzazione, qui e sulla cella Pallet sotto.

                    Il BOTTONE usa `aria-disabled` + una guardia in cima all'`onClick`, non
                    `disabled`: un bottone nativamente `disabled` esce dalla tab order e non riceve
                    mai `.focus()`, e `tornaAlBottone` (sopra) lo chiama proprio mentre `salvando`
                    è già valorizzato — `commitCesta` fa `setEditingCesta(null)` e SUBITO DOPO
                    `onPatch(...)`, che aggiunge l'id a `salvando` in modo sincrono: stesso render,
                    editor già smontato, bottone di destinazione già "disabilitato" se lo fosse
                    stato per davvero. Con `disabled` vero il focus cadeva sul body a ogni modifica
                    che cambiava il valore — la stessa traversata del modulo che il commento sul
                    ritorno del focus (sopra) dice di aver già risolto una volta.

                    L'INPUT invece resta `disabled={salvando?.has(row.id)}`: è di fatto inerte,
                    perché l'editor si smonta PRIMA che la PATCH parta e quindi input montato e
                    `salvando.has(id)` non coesistono mai — ma costa zero e resta una cintura in
                    più se un giorno l'ordine dei due aggiornamenti di stato cambiasse.
                  */}
                  {editingCesta === row.id ? (
                    <input
                      autoFocus
                      value={cestaValue}
                      onChange={e => setCestaValue(e.target.value)}
                      aria-label={`Cesta per il misuratore ${row.matricola}`}
                      /*
                        `inputMode` e non `type="number"`: la cesta è un RIFERIMENTO, non una
                        quantità. Col campo numerico gli zeri di testa sparirebbero e le frecce
                        del mouse potrebbero cambiarla per sbaglio scorrendo la tabella.
                      */
                      inputMode="numeric"
                      disabled={salvando?.has(row.id)}
                      onBlur={() => {
                        if (annullaCesta.current) { annullaCesta.current = false; return; }
                        void commitCesta(row.id, row.cesta);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitCesta(row.id, row.cesta);
                        if (e.key === 'Escape') {
                          annullaCesta.current = true;
                          cestaAppenaChiusa.current = row.id;
                          setEditingCesta(null);
                        }
                      }}
                      className="w-20 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-1.5 py-0.5 font-mono text-xs tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:cursor-wait disabled:opacity-60"
                    />
                  ) : (
                    <button
                      type="button"
                      data-cesta-btn={row.id}
                      aria-label={`Modifica cesta per il misuratore ${row.matricola}`}
                      onClick={() => {
                        // Guardia al posto del `disabled` nativo: vedi il commento sopra.
                        if (salvando?.has(row.id)) return;
                        startCestaEdit(row);
                      }}
                      aria-disabled={salvando?.has(row.id)}
                      className="w-full cursor-text rounded-[var(--radius-sm)] text-left font-mono text-xs tabular-nums text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] aria-disabled:cursor-wait aria-disabled:opacity-60"
                      title="Clicca per scrivere il numero della cesta"
                    >
                      {row.cesta?.trim() || '—'}
                    </button>
                  )}
                </td>
              )}

              {/* Dropdown stato inline */}
              <td {...cella('Stato').props} className={`whitespace-nowrap px-3 py-2 ${cella('Stato').classe}`}>
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
              <td {...cella('Note').props} className={`min-w-[140px] px-3 py-2 ${cella('Note').classe}`}>
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
    </>
  );
}
