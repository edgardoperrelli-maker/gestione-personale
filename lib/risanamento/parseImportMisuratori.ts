/** Un misuratore di riferimento pronto per l'insert in risanamento_misuratori_ref. */
export type MisuratoreRefInput = {
  indirizzo: string;
  civico: string;
  comune: string;
  cap: string;
  pdr: string;
  matricola: string;
  nominativo: string;
  odl: string;
};

export type ParseResult = {
  records: MisuratoreRefInput[];
  totale: number;   // righe dati non vuote (escluso header); = records.length + scartate
  scartate: number; // righe senza matricola
};

type Campo = keyof MisuratoreRefInput;

/** Pattern per riconoscere l'intestazione di colonna (su stringa normalizzata). */
const PATTERN: Record<Campo, RegExp> = {
  matricola: /matricola|matr/,
  pdr: /pdr|puntodiriconsegna|puntoriconsegna/,
  nominativo: /nominativo|intestatario|cliente|^nome/,
  indirizzo: /indirizzo|^via$|odonimo|toponimo/,
  civico: /civico|nciv|numciv/,
  comune: /comune|citta|localita/,
  cap: /^cap$|^c\.?a\.?p/,
  // `^ordine$` ancorato: le estrazioni ACEA per comune intestano l'ODL "Ordine". Senza ancore
  // un pattern come /ordin/ prenderebbe anche "Coordinate" delle estrazioni geolocalizzate.
  odl: /ods|odl|ordinativo|^ordine$/,
};

/** Normalizza un'intestazione: minuscolo, senza accenti/diacritici, senza non-alfanumerici. */
function normHeader(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cell(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * Parsifica le righe grezze di un foglio (header in riga 0) in record misuratore.
 * - Mappa le colonne per pattern (case/accent/space-insensitive).
 * - Scarta (contandole) le righe senza matricola.
 * - Lancia Error se manca la colonna matricola.
 */
export function parseImportMisuratori(rows: unknown[][]): ParseResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { records: [], totale: 0, scartate: 0 };
  }
  const header = rows[0] ?? [];
  const idx: Partial<Record<Campo, number>> = {};
  header.forEach((h, i) => {
    const n = normHeader(h);
    (Object.keys(PATTERN) as Campo[]).forEach((campo) => {
      if (idx[campo] === undefined && PATTERN[campo].test(n)) idx[campo] = i;
    });
  });

  if (idx.matricola === undefined) {
    throw new Error('Colonna "matricola" mancante nel file.');
  }

  const get = (row: unknown[], campo: Campo): string =>
    idx[campo] === undefined ? '' : cell(row[idx[campo] as number]);

  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => cell(c) !== ''));
  const records: MisuratoreRefInput[] = [];
  let scartate = 0;

  for (const row of dataRows) {
    const matricola = get(row, 'matricola');
    if (!matricola) { scartate++; continue; }
    records.push({
      indirizzo: get(row, 'indirizzo'),
      civico: get(row, 'civico'),
      comune: get(row, 'comune'),
      cap: get(row, 'cap'),
      pdr: get(row, 'pdr'),
      matricola,
      nominativo: get(row, 'nominativo'),
      odl: get(row, 'odl'),
    });
  }

  return { records, totale: dataRows.length, scartate };
}
