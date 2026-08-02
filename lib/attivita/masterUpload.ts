// PURA: parser dei file master caricati a mano dagli admin (limitazioni massive per
// comune, sostituzioni Acqua Latina) per template_master_righe. DIFENSIVO per progetto:
// le colonne si risolvono per NOME (pattern robusti ad accenti/maiuscole/spazi, come
// parseImportMisuratori) e i campi assenti restano '' — al build del template i buchi
// si riempiono, se possibile, dalle altre fonti. L'header può NON essere la prima riga
// (i master ACEA hanno righe di preambolo): si scandiscono le prime righe del foglio.

export type RigaMasterUpload = {
  odl: string;
  matricola: string;
  impianto: string;
  indirizzo: string;
  cap: string;
  comune: string;
  operazione: string;
  nominativo: string;
  recapito: string;
};

export type ParseMasterResult = {
  righe: RigaMasterUpload[];
  totale: number;   // righe dati non vuote sotto l'header; = righe.length + scartate
  scartate: number; // righe senza ODL
};

type Campo = keyof RigaMasterUpload;

/** Pattern sull'intestazione normalizzata (minuscolo, senza accenti né non-alfanumerici). */
const PATTERN: Record<Campo, RegExp> = {
  // `^ordine$` ancorato (come parseImportMisuratori): /ordin/ nudo prenderebbe "Coordinate".
  odl: /^ordine$|ods|odl|ordinativo/,
  matricola: /matricola|matr/,
  // L'IMPIANTO è la chiave stabile del punto (sopravvive alla sostituzione del contatore,
  // la matricola no) e su AcquaLatina è il numero d'ordine del committente: da noi finisce
  // in `interventi.pdr`, che è lo stesso slot — la UI lo etichetta «PDR / impianto».
  //
  // Nell'estrazione AcquaLatina la colonna NON si chiama impianto: si chiama
  // **COD_FORNITURA** (il punto è la fornitura, nel loro gergo). È il nome che conta di
  // più qui — è quello del file che si carica davvero — e senza di lui il master entra
  // senza impianti senza dire niente a nessuno, che è esattamente com'è andata.
  //
  // Ancorato a `^`: l'header ACEA "DESCRIZIONE PDR/IMPIANTO" è la descrizione dell'ordine,
  // non il codice, e non deve entrare qui.
  impianto: /^(n|cod|codice)?(impianto|fornitura)|^pdr/,
  indirizzo: /indirizzo|^via$|ubicazione|toponimo/,
  cap: /^cap$/, // l'header normalizzato riduce "C.A.P." a "cap"
  comune: /comune|citta|localita/,
  // niente /descrizione/ nudo: prenderebbe "Descrizione Stato Ordine".
  operazione: /operazione|descrizioneattivita|^attivita/,
  /*
    L'INTESTATARIO della fornitura. Nel file AcquaLatina la colonna è NOME_UTENTE — «utente»
    è il loro modo di dire cliente — ma lo stesso dato si chiama INTESTATARIO o NOMINATIVO
    altrove, e i tre nomi convivono nei file che passano per l'ufficio.

    `utente` NON è ancorato di proposito: prende NOME_UTENTE, NOME UTENTE, UTENTE. È il
    motivo per cui `recapito` qui sotto sta attento a non prendere «RECAPITO UTENTE» due
    volte — non può: il primo pattern che aggancia una colonna se la tiene (vedi
    `mappaColonne`), e l'ordine di questa mappa mette `nominativo` prima.

    Un header «CODICE UTENTE» finirebbe qui per errore: non compare in nessuno dei file in
    uso, e la cella si vedrebbe subito sbagliata nella colonna «Nome utente» della tabella —
    un buco silenzioso, che è il difetto vero, non lo produce.
  */
  nominativo: /nomeutente|intestatario|nominativo|^utente/,
  // Telefono dell'utente. `recapito` nudo perché nei file arriva sia solo che come
  // «RECAPITO UTENTE»/«RECAPITO TELEFONICO»; `telefono`/`cellulare` per i file che lo
  // chiamano col nome del mezzo invece che con quello della cosa.
  recapito: /recapito|telefono|cellulare|^tel$/,
};

function normHeader(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const cell = (v: unknown): string => String(v ?? '').trim();

function mappaColonne(header: unknown[]): Partial<Record<Campo, number>> {
  const idx: Partial<Record<Campo, number>> = {};
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (!n) return;
    (Object.keys(PATTERN) as Campo[]).forEach((campo) => {
      if (idx[campo] === undefined && PATTERN[campo].test(n)) idx[campo] = i;
    });
  });
  return idx;
}

/** Indice 0-based della riga intestazione: la prima (entro maxScan) con la colonna ODL
 *  e almeno un altro campo noto; in mancanza, la prima con la sola colonna ODL; -1 se niente. */
export function trovaHeaderMaster(rows: unknown[][], maxScan = 15): number {
  let soloOdl = -1;
  const lim = Math.min(maxScan, rows?.length ?? 0);
  for (let i = 0; i < lim; i++) {
    const idx = mappaColonne(rows[i] ?? []);
    if (idx.odl === undefined) continue;
    const altri = ([
      'matricola', 'impianto', 'indirizzo', 'cap', 'comune', 'operazione', 'nominativo', 'recapito',
    ] as const)
      .filter((c) => idx[c] !== undefined).length;
    if (altri >= 1) return i;
    if (soloOdl === -1) soloOdl = i;
  }
  return soloOdl;
}

/**
 * Parsifica le righe grezze del foglio in righe master.
 * - Trova l'header (anche non in prima riga) e mappa le colonne per pattern.
 * - Scarta (contandole) le righe senza ODL.
 * - Lancia Error se la colonna ODL/ORDINE non si trova.
 */
export function parseMasterUpload(rows: unknown[][]): ParseMasterResult {
  const headerIdx = trovaHeaderMaster(rows ?? []);
  if (headerIdx === -1) {
    throw new Error('Colonna ODL/ORDINE non trovata nel file.');
  }
  const idx = mappaColonne(rows[headerIdx] ?? []);
  const get = (row: unknown[], campo: Campo): string =>
    idx[campo] === undefined ? '' : cell(row[idx[campo] as number]);

  const dataRows = rows.slice(headerIdx + 1).filter((r) => Array.isArray(r) && r.some((c) => cell(c) !== ''));
  const righe: RigaMasterUpload[] = [];
  let scartate = 0;
  for (const row of dataRows) {
    const odl = get(row, 'odl');
    if (!odl) { scartate++; continue; }
    righe.push({
      odl,
      matricola: get(row, 'matricola'),
      impianto: get(row, 'impianto'),
      indirizzo: get(row, 'indirizzo'),
      cap: get(row, 'cap'),
      comune: get(row, 'comune'),
      operazione: get(row, 'operazione'),
      nominativo: get(row, 'nominativo'),
      recapito: get(row, 'recapito'),
    });
  }
  return { righe, totale: dataRows.length, scartate };
}
