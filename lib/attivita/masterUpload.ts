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
  /*
    `ragsoc` aggiunto il 2026-08-03: l'export di Latina di TERRACINA01 chiama l'intestatario
    RAGSOC (ragione sociale), e nessuno degli altri tre nomi lo agganciava. Caricando quel
    file dalla UI il nome utente non entrava affatto — silenziosamente, perché una colonna
    non riconosciuta non è un errore: è una colonna che non c'è. Sono 3.940 righe di
    anagrafica che sul campo l'operatore non vedeva.
  */
  nominativo: /nomeutente|intestatario|nominativo|ragsoc|ragionesociale|^utente/,
  // Telefono dell'utente. `recapito` nudo perché nei file arriva sia solo che come
  // «RECAPITO UTENTE»/«RECAPITO TELEFONICO»; `telefono`/`cellulare` per i file che lo
  // chiamano col nome del mezzo invece che con quello della cosa.
  recapito: /recapito|telefono|cellulare|^tel$/,
};

/**
 * Le colonne del BATTENTE — l'export ODL del sito AcquaLatina (file «1BATTENTE_ODL_…», foglio
 * OdL). Riconosciute per nome ESATTO normalizzato, non coi pattern generici, per tre trappole
 * vere di quel file:
 *  - «Codice OdL» (SCL289991: il codice interno del loro scheduler) casca nel pattern /odl/
 *    PRIMA di «Codice Esterno», che è il numero d'ordine vero — quello che il registro chiama
 *    `odl` e con cui il file degli esiti si aggancia;
 *  - «Indirizzo utente normalizzato» casca in /indirizzo/ ed è sporco («VIA MAZZINI 81
 *    (no Norm. 81)»): la via buona è «Indirizzo Utente», con civico e suffisso in colonne loro;
 *  - l'impianto non ha una colonna sua: sta dentro «Utenza/impianto» come «27410580 - NOME».
 * Il file non porta matricole: l'identità qui è il solo ODL, e le matricole restano quelle
 * che il registro già conosce.
 */
const COLONNE_BATTENTE = {
  odl: 'codiceesterno',
  utenza: 'utenzaimpianto',
  nominativo: 'ragionesociale',
  comune: 'comuneutente',
  via: 'indirizzoutente',
  civico: 'civico',
  suffisso: 'suffissocivico',
  recapito: 'telefono',
} as const;

type ColonnaBattente = keyof typeof COLONNE_BATTENTE;

/** Indici delle colonne battente, o null se la riga non è l'header di un battente:
 *  la firma del formato è la coppia («Codice Esterno», «Utenza/impianto»), che nessun
 *  altro file in uso ha. */
function mappaBattente(header: unknown[]): Partial<Record<ColonnaBattente, number>> | null {
  const idx: Partial<Record<ColonnaBattente, number>> = {};
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (!n) return;
    (Object.keys(COLONNE_BATTENTE) as ColonnaBattente[]).forEach((c) => {
      if (idx[c] === undefined && n === COLONNE_BATTENTE[c]) idx[c] = i;
    });
  });
  return idx.odl !== undefined && idx.utenza !== undefined ? idx : null;
}

/**
 * «27410580 - BOSCHETTO LUCIA» → impianto e nominativo. L'impianto è SEMPRE il codice
 * numerico (parola del committente); un valore senza separatore ma tutto cifre è un impianto
 * senza intestatario, qualunque altra forma non è decifrabile e non si inventa niente.
 */
export function spartiUtenzaImpianto(v: unknown): { impianto: string; nominativo: string } {
  const testo = cell(v);
  const m = /^(\d+)\s*-\s*(.*)$/.exec(testo);
  if (m) return { impianto: m[1], nominativo: m[2].trim() };
  if (/^\d+$/.test(testo)) return { impianto: testo, nominativo: '' };
  return { impianto: '', nominativo: '' };
}

/**
 * L'escaping SQL-style che il battente si porta dietro: «D''ONOFRIO» per D'ONOFRIO,
 * «''''HAPPY GELO''''» per "HAPPY GELO" (misurato sul file reale: 97 nominativi e 13 vie).
 * Senza questo passaggio l'import — che dal 04/08 sovrascrive il difforme — «correggerebbe»
 * al contrario, riscrivendo il registro con i valori storpiati. L'ordine conta: prima il
 * quadruplo, poi il doppio.
 */
function deApostrofa(v: string): string {
  return v.replace(/''''/g, '"').replace(/''/g, "'");
}

function parseBattente(
  rows: unknown[][],
  headerIdx: number,
  idx: Partial<Record<ColonnaBattente, number>>,
): ParseMasterResult {
  const get = (row: unknown[], c: ColonnaBattente): string =>
    idx[c] === undefined ? '' : cell(row[idx[c] as number]);
  const dataRows = rows.slice(headerIdx + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => cell(c) !== ''));
  const righe: RigaMasterUpload[] = [];
  let scartate = 0;
  for (const row of dataRows) {
    const odl = get(row, 'odl');
    if (!odl) { scartate++; continue; }
    const utenza = spartiUtenzaImpianto(row[idx.utenza as number]);
    // Civico «0» = non ce l'ha (convenzione del file); il suffisso («INT», «PT») si attacca
    // col «/», la stessa forma dei civici già a registro («58/PT»).
    const civico = get(row, 'civico').replace(/^0$/, '');
    const suffisso = get(row, 'suffisso');
    const civicoPieno = civico ? (suffisso ? `${civico}/${suffisso}` : civico) : '';
    const via = deApostrofa(get(row, 'via'));
    // «---» e «0» sono i due modi del file di dire «niente telefono» (1.703 e 8 righe).
    const recapito = get(row, 'recapito').replace(/^(?:-+|0)$/, '');
    righe.push({
      odl,
      matricola: '',
      impianto: utenza.impianto,
      indirizzo: [via, civicoPieno].filter(Boolean).join(' '),
      cap: '',
      comune: get(row, 'comune'),
      operazione: '',
      nominativo: deApostrofa(get(row, 'nominativo') || utenza.nominativo),
      recapito,
    });
  }
  return { righe, totale: dataRows.length, scartate };
}

/** Intestazione normalizzata (minuscolo, senza accenti né non-alfanumerici): la usa anche il
 *  parser degli esiti AcquaLatina, che risolve le colonne per nome allo stesso modo. */
export function normHeader(v: unknown): string {
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
  const lim = Math.min(15, rows?.length ?? 0);
  for (let i = 0; i < lim; i++) {
    const header = (rows[i] ?? []).map(normHeader);
    /*
      Il file ESECUZIONI del sito (gli esiti) si RIFIUTA prima di ogni parsing: caricato come
      master il 04/08 è passato dal percorso generico — /odl/ ha agganciato il «Codice Odl»
      interno (SCL…) — e 359 ordini fantasma sono entrati a registro. La colonna «Codice
      Esterno dell'OdL» esiste solo in quell'export, ed è la firma con cui lo si ferma qui,
      col nome del posto giusto.
    */
    if (header.includes('codiceesternodellodl')) {
      throw new Error(
        'Questo è il file degli ESITI del sito (ESECUZIONI): va caricato nel «Confronto esiti col sito», non come master.',
      );
    }
    // Il battente si riconosce PRIMA del percorso generico: sui suoi header i pattern generici
    // aggancerebbero le colonne sbagliate (vedi COLONNE_BATTENTE), e in silenzio.
    const idx = mappaBattente(rows[i] ?? []);
    if (idx) return parseBattente(rows, i, idx);
  }
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
