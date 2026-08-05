import 'server-only';
import ExcelJS from 'exceljs';
import type { RigaExportSal } from './importSal';
import { dataDaRaw } from './dataDaRaw';

// L'unica parte con I/O dell'import SAL: da workbook a righe grezze. Tutto il resto —
// lotti, numerazione, righe da scrivere — sta in `importSal.ts`, che è puro e provato.
//
// Le colonne si risolvono per NOME e non per posizione: SAP riordina le colonne fra un export e
// l'altro, e un parser posizionale scriverebbe numeri sbagliati senza accorgersene.

const COL = {
  odl: 'Ordine',
  docAcquisti: 'Documento acquisti',
  posizione: 'Posizione',
  valoreAps: 'Valore APS',
  causa: 'Causa scostamento',
  attivita: 'Operazione testo breve',
  dataCompletamento: 'Data completamento lavori',
  dataRegistrazione: 'Data registrazione',
} as const;

/** Le colonne senza le quali il file non è un export SAL: la loro assenza lo rifiuta. */
const OBBLIGATORIE = [COL.odl, COL.docAcquisti, COL.posizione, COL.valoreAps, COL.dataRegistrazione] as const;

export type EsitoLettura =
  | { ok: true; righe: RigaExportSal[]; scartate: number }
  | { ok: false; motivo: string; dettagli?: string[] };

/** Testo da una cella exceljs (rich text / formula / hyperlink / data / scalare). */
function testoCella(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDaData(v);
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return v.result === null || v.result === undefined ? '' : String(v.result);
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink;
  }
  return String(v);
}

/** Le date Excel arrivano a mezzanotte UTC: i getter UTC le tengono ferme su qualsiasi fuso. */
function isoDaData(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const t = (v: ExcelJS.CellValue): string => testoCella(v).trim();

/**
 * "Valore APS" arriva come testo allineato a destra ("           25.46"), non come numero: il
 * punto è il separatore decimale e gli spazi sono riempimento. `Number()` sullo spazio dà 0 —
 * cioè un SAL da zero euro — quindi si ripulisce prima di convertire.
 */
function numeroAps(v: ExcelJS.CellValue): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = testoCella(v).replace(/\s/g, '');
  if (!s) return 0;
  // SAP scrive col punto decimale ("25.46"). Il formato italiano ("1.234,56") compare solo se
  // qualcuno riapre e risalva il file con Excel in locale it-IT: si riconosce dalla virgola.
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
}

/** Indice 0-based della colonna con quel nome nell'intestazione; -1 se assente. */
function indiceColonna(header: readonly string[], nome: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === nome.toLowerCase());
}

export async function leggiExportSal(buf: ArrayBuffer | Buffer): Promise<EsitoLettura> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as ArrayBuffer);
  } catch {
    return { ok: false, motivo: 'Il file non è un .xlsx leggibile.' };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, motivo: 'Il file non contiene fogli.' };

  // Intestazione: la prima riga (nelle prime 20) che contiene la colonna "Ordine". SAP a volte
  // antepone righe di titolo all'export, e partire dalla riga 1 a occhi chiusi le leggerebbe
  // come dati.
  let rIntest = 0;
  let header: string[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const valori = ((ws.getRow(r).values as ExcelJS.CellValue[]) ?? []).slice(1).map((v) => t(v));
    if (indiceColonna(valori, COL.odl) >= 0) {
      rIntest = r;
      header = valori;
      break;
    }
  }
  if (rIntest === 0) {
    return { ok: false, motivo: `Intestazione non trovata: manca la colonna «${COL.odl}».` };
  }

  const mancanti = OBBLIGATORIE.filter((c) => indiceColonna(header, c) < 0);
  if (mancanti.length > 0) {
    return {
      ok: false,
      motivo: "Il file non ha il formato dell'export SAL ACEA: colonne mancanti.",
      dettagli: [...mancanti],
    };
  }

  const idx = {
    odl: indiceColonna(header, COL.odl),
    docAcquisti: indiceColonna(header, COL.docAcquisti),
    posizione: indiceColonna(header, COL.posizione),
    valoreAps: indiceColonna(header, COL.valoreAps),
    causa: indiceColonna(header, COL.causa),
    attivita: indiceColonna(header, COL.attivita),
    dataCompletamento: indiceColonna(header, COL.dataCompletamento),
    dataRegistrazione: indiceColonna(header, COL.dataRegistrazione),
  };
  const cella = (riga: ExcelJS.CellValue[], i: number): ExcelJS.CellValue => (i >= 0 ? riga[i] ?? null : null);

  const righe: RigaExportSal[] = [];
  let scartate = 0;
  for (let r = rIntest + 1; r <= ws.rowCount; r++) {
    const valori = ((ws.getRow(r).values as ExcelJS.CellValue[]) ?? []).slice(1);
    if (valori.every((v) => t(v) === '')) continue;
    const odl = t(cella(valori, idx.odl));
    if (!odl) {
      scartate += 1;
      continue;
    }
    righe.push({
      odl,
      docAcquisti: t(cella(valori, idx.docAcquisti)),
      posizione: t(cella(valori, idx.posizione)),
      valoreAps: numeroAps(cella(valori, idx.valoreAps)),
      causa: t(cella(valori, idx.causa)),
      attivita: t(cella(valori, idx.attivita)),
      dataCompletamento: dataDaRaw(t(cella(valori, idx.dataCompletamento))),
      dataRegistrazione: dataDaRaw(t(cella(valori, idx.dataRegistrazione))),
    });
  }

  if (righe.length === 0) return { ok: false, motivo: 'Il file non contiene righe con un Ordine valido.' };
  return { ok: true, righe, scartate };
}
