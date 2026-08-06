// lib/acqualatina/coordinateDaFile.ts
// PURA: dal file di coordinate del committente alle righe di `acqualatina_ordini` da aggiornare.
//
// PERCHÉ UN PERCORSO A PARTE, e non il master. Il master è l'elenco dei punti della campagna e la
// sua identità è l'ODL: `parseMasterUpload` scarta le righe che non ce l'hanno, e `ordiniDaMaster`
// ci costruisce sopra la chiave (odl, matricola). L'estrazione con le coordinate è un'altra cosa —
// è l'anagrafica dell'INTERO comune, forniture comprese quelle senza un ordine aperto: nel file di
// Terracina 4.194 righe portano le coordinate e solo 489 hanno un CODODL. Farla passare di là
// vorrebbe dire buttare 3.705 punti, o peggio inventare ordini che il committente non ha dato.
//
// Qui non nasce mai una riga: si ARRICCHISCE quello che il registro ha già. Una fornitura che il
// modulo non conosce si conta e si dice, non entra.

import { parseLatLng } from '@/utils/routing/parseCoordinate';
import { normHeader } from '@/lib/attivita/masterUpload';

/** Una riga del file ridotta a ciò che serve: come si aggancia, e cosa porta. */
export type RigaCoordinata = {
  odl: string;
  impianto: string;
  coordinate: string;
};

export type ParseCoordinateResult = {
  righe: RigaCoordinata[];
  /** Righe dati non vuote sotto l'header. */
  totale: number;
  /** Righe scartate perché senza coordinate valide (celle vuote, 0/0, fuori range). */
  senzaCoordinate: number;
  /** Righe scartate perché senza né ODL né COD_FORNITURA: non c'è modo di agganciarle. */
  senzaAggancio: number;
};

type Campo = 'odl' | 'impianto' | 'latitudine' | 'longitudine';

/**
 * I nomi con cui le colonne arrivano, sull'header normalizzato.
 *
 * `odl` è ancorato a inizio o fine header, mai in mezzo: «SER_CODLIBRO» normalizza in
 * «ser*codl*ibro», che CONTIENE «odl» e sta a sinistra di CODODL — un pattern libero prenderebbe
 * il numero del libretto al posto dell'ordine. Per lo stesso motivo `^ordine$` è chiuso: /ordin/
 * nudo aggancia «Coordinate».
 *
 * `impianto` ripete il pattern del master (`COD_FORNITURA` è il nome vero nel gergo del
 * committente: il punto è la fornitura), ancorato a `^` perché «DESCRIZIONE PDR/IMPIANTO» è una
 * descrizione, non un codice.
 */
const PATTERN: Record<Campo, RegExp> = {
  odl: /od[sl]$|^(n|cod|codice)?od[sl]|^ordinativo$|^ordine$/,
  impianto: /^(n|cod|codice)?(impianto|fornitura)|^pdr/,
  latitudine: /^lat(itudine)?$/,
  longitudine: /^long(itudine)?$|^lon$|^lng$/,
};

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

/**
 * L'indice della riga di intestazione: la prima (entro `maxScan`) che ha ENTRAMBE le colonne
 * delle coordinate e almeno un modo per agganciare la riga. Come nel master, l'header può non
 * essere la prima riga del foglio.
 */
export function trovaHeaderCoordinate(rows: unknown[][], maxScan = 15): number {
  const lim = Math.min(maxScan, rows?.length ?? 0);
  for (let i = 0; i < lim; i++) {
    const idx = mappaColonne(rows[i] ?? []);
    if (idx.latitudine === undefined || idx.longitudine === undefined) continue;
    if (idx.odl === undefined && idx.impianto === undefined) continue;
    return i;
  }
  return -1;
}

/**
 * Parsifica il foglio nelle righe agganciabili.
 *
 * Lancia se il file non ha le due colonne delle coordinate (o non ha come agganciarle): è un file
 * sbagliato, e dirlo subito è meglio che riportare «0 aggiornate» da un import andato a vuoto.
 */
export function parseCoordinateFile(rows: unknown[][]): ParseCoordinateResult {
  const headerIdx = trovaHeaderCoordinate(rows ?? []);
  if (headerIdx === -1) {
    throw new Error(
      'Il file non ha le colonne LATITUDINE e LONGITUDINE insieme a CODODL o COD_FORNITURA: non è l’estrazione con le coordinate.',
    );
  }
  const idx = mappaColonne(rows[headerIdx] ?? []);
  const get = (row: unknown[], campo: Campo): string =>
    idx[campo] === undefined ? '' : cell(row[idx[campo] as number]);

  const dataRows = (rows.slice(headerIdx + 1)).filter(
    (r) => Array.isArray(r) && r.some((c) => cell(c) !== ''),
  );
  const righe: RigaCoordinata[] = [];
  let senzaCoordinate = 0;
  let senzaAggancio = 0;

  for (const row of dataRows) {
    const coordinate = parseLatLng(get(row, 'latitudine'), get(row, 'longitudine'));
    if (!coordinate) { senzaCoordinate++; continue; }
    const odl = get(row, 'odl');
    const impianto = get(row, 'impianto');
    if (odl === '' && impianto === '') { senzaAggancio++; continue; }
    righe.push({ odl, impianto, coordinate });
  }

  return { righe, totale: dataRows.length, senzaCoordinate, senzaAggancio };
}

/** Una riga del registro, ridotta a quello che l'abbinamento guarda. */
export type OrdineDaCoordinare = {
  odl: string;
  numero_operazione: string;
  impianto: string | null;
  /** Quella che ha già: una coordinata identica non si riscrive. */
  coordinate: string | null;
};

export type Aggiornamento = {
  odl: string;
  numero_operazione: string;
  coordinate: string;
};

export type EsitoAbbinamento = {
  aggiornamenti: Aggiornamento[];
  /** Righe di registro che avevano già ESATTAMENTE quella coordinata. */
  giaUguali: number;
  /** Righe del file che il registro non conosce (né per fornitura né per ODL). */
  nonTrovate: number;
};

/** Chiave di confronto di un codice del committente: via spazi e zeri non significativi no —
 *  i codici arrivano come li scrive il file, e uno «08» non è lo stesso punto di un «8». */
const chiave = (v: string | null | undefined): string => String(v ?? '').trim();

/**
 * Abbina le righe del file a quelle del registro.
 *
 * DUE agganci, in quest'ordine:
 *  1. l'IMPIANTO (COD_FORNITURA) — è il punto di fornitura, cioè esattamente la cosa che ha delle
 *     coordinate. Un ordine può cambiare, il punto no;
 *  2. l'ODL, quando la fornitura non si trova (o il file non la porta). Un ODL di AcquaLatina
 *     copre fino a cinque contatori dello stesso condominio: la coordinata scende su TUTTE le sue
 *     operazioni, perché è il portone, ed è la stessa per tutte.
 *
 * Mai il contrario: partire dall'ODL vorrebbe dire dare a cinque appartamenti la coordinata della
 * riga che capita prima, buttando via il dato per-fornitura che il file ha.
 *
 * Idempotente: una riga che ha già quella coordinata non entra negli aggiornamenti, quindi
 * ricaricare lo stesso file una seconda volta non scrive niente.
 */
export function abbinaCoordinate(
  righe: readonly RigaCoordinata[],
  registro: readonly OrdineDaCoordinare[],
): EsitoAbbinamento {
  const perImpianto = new Map<string, OrdineDaCoordinare[]>();
  const perOdl = new Map<string, OrdineDaCoordinare[]>();
  for (const r of registro) {
    const imp = chiave(r.impianto);
    if (imp !== '') perImpianto.set(imp, [...(perImpianto.get(imp) ?? []), r]);
    const odl = chiave(r.odl);
    if (odl !== '') perOdl.set(odl, [...(perOdl.get(odl) ?? []), r]);
  }

  const aggiornamenti: Aggiornamento[] = [];
  // Una riga di registro si scrive UNA volta sola: se il file la nomina due volte (per fornitura
  // e per ODL, o con doppioni) vince il primo abbinamento, quello più preciso.
  const scritte = new Set<string>();
  let giaUguali = 0;
  let nonTrovate = 0;

  for (const r of righe) {
    const bersagli = perImpianto.get(chiave(r.impianto)) ?? perOdl.get(chiave(r.odl)) ?? [];
    if (bersagli.length === 0) { nonTrovate++; continue; }
    for (const b of bersagli) {
      const k = `${b.odl}|${b.numero_operazione}`;
      if (scritte.has(k)) continue;
      if (chiave(b.coordinate) === r.coordinate) { giaUguali++; scritte.add(k); continue; }
      scritte.add(k);
      aggiornamenti.push({ odl: b.odl, numero_operazione: b.numero_operazione, coordinate: r.coordinate });
    }
  }

  return { aggiornamenti, giaUguali, nonTrovate };
}
