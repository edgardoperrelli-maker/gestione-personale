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
import { numeroIt } from '@/utils/numero-it';
import { normMatricola } from './ordiniDaMaster';

/** Una riga del file ridotta a ciò che serve: come si aggancia, e cosa porta. */
export type RigaCoordinata = {
  odl: string;
  impianto: string;
  coordinate: string;
};

/**
 * Quante righe di FOGLIO leggere al massimo (`sheetRows` di SheetJS).
 *
 * Non è una difesa dai file grandi, è una difesa dai file GONFI: l'estrazione di Terracina
 * dichiara un intervallo di 835.771 righe per 4.195 righe di dati — 19 MB di righe fantasma. Senza
 * questo tetto SheetJS le percorre tutte, e sono 35 milioni di celle: 40 secondi di lavoro per
 * leggerne 176 mila utili. Con il tetto sono meno di quattro.
 *
 * Alto abbastanza da non entrare mai in mezzo ai dati veri (il registro intero della commessa è
 * 4.205 righe), e se un giorno un file lo toccasse il parser se ne accorge e lo dice: vedi
 * `parseCoordinateFile`. Un troncamento silenzioso qui vorrebbe dire punti senza coordinate senza
 * che nessuno lo sappia.
 */
export const LIMITE_RIGHE_FOGLIO = 100_000;

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
  // Il foglio è stato letto col tetto di `LIMITE_RIGHE_FOGLIO`: se i dati arrivano fin lassù non
  // si può sapere se sotto ce n'erano altri. Meglio fermarsi che importarne una parte in silenzio.
  if (dataRows.length >= LIMITE_RIGHE_FOGLIO - 1) {
    throw new Error(
      `Il file supera le ${numeroIt(LIMITE_RIGHE_FOGLIO)} righe leggibili in un colpo: dividilo per comune e caricalo in più volte.`,
    );
  }
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

/**
 * Le righe che arrivano dal CLIENT, ricontrollate una per una.
 *
 * Il foglio si legge nel browser — 19 MB di file non passano da una funzione serverless, e i dati
 * utili sono 300 KB — quindi quello che il server riceve non l'ha prodotto lui: è un payload, e un
 * payload si valida. La coordinata si ricalcola da capo con `parseLatLng`, la stessa guardia del
 * percorso di prima: quello che non è una coordinata italiana valida non entra nel registro,
 * comunque sia stato scritto.
 *
 * Scarta invece di lanciare: una riga malformata in mezzo a quattromila non deve far fallire
 * l'import: chi chiama conta quante ne restano.
 */
export function righeDaPayload(input: unknown): RigaCoordinata[] {
  if (!Array.isArray(input)) return [];
  const out: RigaCoordinata[] = [];
  for (const v of input) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    /*
      Il contratto è la forma che produce `parseLatLng`: «lat, lng» col PUNTO decimale. Si pretende
      che le parti siano esattamente due — una coppia scritta all'italiana («41,288, 13,224») ne
      darebbe quattro, e indovinare quale virgola separa i due numeri e quale è decimale
      significherebbe scrivere a registro una coordinata inventata. Meglio scartarla.
    */
    const parti = String(r.coordinate ?? '').split(',');
    if (parti.length !== 2) continue;
    const coordinate = parseLatLng(parti[0], parti[1]);
    if (!coordinate) continue;
    const odl = String(r.odl ?? '').trim();
    const impianto = String(r.impianto ?? '').trim();
    if (odl === '' && impianto === '') continue;
    out.push({ odl, impianto, coordinate });
  }
  return out;
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

/* ------------------------------------------------------------------------------------------------
   Dal registro ai rapportini GIÀ APERTI.

   Il motore dei rapportini scrive la coordinata nel `raw_json` della voce quando la voce NASCE. Una
   giornata già distribuita — gli operatori hanno il link in mano da stamattina — resterebbe senza,
   e l'import servirebbe solo da domani. Queste due funzioni chiudono quel buco: dopo aver scritto
   il registro, l'import ripassa sulle voci del giorno e ci mette la coordinata che ora esiste.
   ------------------------------------------------------------------------------------------------ */

/** Riga di registro come serve alla propagazione: la matricola normalizzata è la seconda chiave. */
export type OrdineConMatricola = OrdineDaCoordinare & { matricola_norm?: string | null };

/**
 * Le coordinate del registro indicizzate come le cerca una voce di rapportino.
 *
 * DUE chiavi per riga, e l'ordine di preferenza lo decide chi legge (`vociDaAggiornare`):
 *  - `odl#matricola` — quella giusta, perché su AcquaLatina un ordine copre fino a cinque contatori
 *    e ognuno ha la sua fornitura, quindi il suo punto;
 *  - `odl` da solo — il ripiego per la voce che la matricola non ce l'ha (o l'ha scritta in un'altra
 *    forma). Vince la prima riga dell'ordine: su un condominio è comunque il portone.
 *
 * `aggiornamenti` sono le scritture appena fatte: si sovrappongono al valore letto prima, così la
 * mappa descrive il registro com'è ADESSO senza doverlo rileggere.
 */
export function coordinatePerVoce(
  registro: readonly OrdineConMatricola[],
  aggiornamenti: readonly Aggiornamento[],
): Map<string, string> {
  const appena = new Map<string, string>(
    aggiornamenti.map((a) => [`${a.odl}|${a.numero_operazione}`, a.coordinate]),
  );
  const out = new Map<string, string>();
  for (const r of registro) {
    const coordinata = appena.get(`${r.odl}|${r.numero_operazione}`) ?? chiave(r.coordinate);
    if (coordinata === '') continue;
    const odl = chiave(r.odl);
    if (odl === '') continue;
    const m = normMatricola(r.matricola_norm);
    if (m !== '') out.set(`${odl}#${m}`, coordinata);
    if (!out.has(odl)) out.set(odl, coordinata);
  }
  return out;
}

/** Una voce di rapportino, ridotta a quello che la propagazione guarda. */
export type VoceDaCoordinare = {
  id: string;
  odl: string | null;
  matricola: string | null;
  raw_json: Record<string, unknown> | null;
};

/**
 * Le voci da riscrivere, col loro `raw_json` GIÀ FUSO.
 *
 * Il raw_json si conserva intero e ci si aggiunge `coordinate`: dentro ci vivono la nota
 * dell'ufficio, il badge «nuovo», il flag di provenienza — sostituirlo con un oggetto di una chiave
 * sola cancellerebbe roba che l'operatore sta guardando.
 *
 * Chi ha già quella coordinata non entra: rilanciare l'import non riscrive le voci.
 */
export function vociDaAggiornare(
  voci: readonly VoceDaCoordinare[],
  coordinate: ReadonlyMap<string, string>,
): Array<{ id: string; raw_json: Record<string, unknown> }> {
  const out: Array<{ id: string; raw_json: Record<string, unknown> }> = [];
  for (const v of voci) {
    const odl = chiave(v.odl);
    if (odl === '') continue;
    const m = normMatricola(v.matricola);
    const coordinata = (m !== '' ? coordinate.get(`${odl}#${m}`) : undefined) ?? coordinate.get(odl);
    if (!coordinata) continue;
    const raw = v.raw_json ?? {};
    if (chiave(raw.coordinate as string | undefined) === coordinata) continue;
    out.push({ id: v.id, raw_json: { ...raw, coordinate: coordinata } });
  }
  return out;
}
