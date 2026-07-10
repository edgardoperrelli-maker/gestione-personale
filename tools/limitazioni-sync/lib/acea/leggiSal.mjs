// Legge i file "SAL N.xlsx" della cartella CONTABILITA' (export SAP): per NOME colonna, come il
// master DUNNING (leggiMasterAcea.mjs), robusto al riordino delle colonne SAP.
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook } from '../excelIO.mjs';
import { risolviColonna } from '../colonne.mjs';
import { trovaIntestazioneAcea } from './leggiMasterAcea.mjs';

const COL = {
  odl: 'Ordine',
  docAcquisti: 'Documento acquisti',
  posizione: 'Posizione',
  valoreAps: 'Valore APS',
  causa: 'Causa scostamento',
  attivita: 'Operazione testo breve',
  dataCompletamento: 'Data completamento lavori',
  dataRegistrazione: 'Data registrazione',
};

const t = (v) => String(v ?? '').trim();

/** Numero SAL dal nome file ("SAL 1.xlsx", "sal 12.xlsx"); null se non riconoscibile. */
export function numeroSalDaNome(nomeFile) {
  const m = t(nomeFile).match(/SAL\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Legge un singolo file SAL. Righe senza Ordine scartate. [] se la colonna Ordine non c'è. */
export async function leggiFileSal(file) {
  const wb = await caricaWorkbook(file);
  const ws = wb.worksheets[0];
  const tutte = [];
  for (let r = 1; r <= ws.rowCount; r++) tutte.push((ws.getRow(r).values || []).slice(1));
  const rIntest = trovaIntestazioneAcea(tutte, COL.odl);
  const header = tutte[rIntest - 1] || [];
  const idx = {
    odl: risolviColonna(header, COL.odl),
    docAcquisti: risolviColonna(header, COL.docAcquisti),
    posizione: risolviColonna(header, COL.posizione),
    valoreAps: risolviColonna(header, COL.valoreAps),
    causa: risolviColonna(header, COL.causa),
    attivita: risolviColonna(header, COL.attivita),
    dataCompletamento: risolviColonna(header, COL.dataCompletamento),
    dataRegistrazione: risolviColonna(header, COL.dataRegistrazione),
  };
  if (idx.odl < 0) return [];
  const cella = (row, i) => (i >= 0 && row[i] != null ? row[i] : null);
  const righe = [];
  for (const row of tutte.slice(rIntest)) {
    const odl = t(cella(row, idx.odl));
    if (!odl) continue;
    righe.push({
      odl,
      docAcquisti: t(cella(row, idx.docAcquisti)),
      posizione: t(cella(row, idx.posizione)),
      valoreAps: Number(cella(row, idx.valoreAps)) || 0,
      causa: t(cella(row, idx.causa)),
      attivita: t(cella(row, idx.attivita)),
      dataCompletamentoRaw: String(cella(row, idx.dataCompletamento) ?? ''),
      dataRegistrazioneRaw: String(cella(row, idx.dataRegistrazione) ?? ''),
    });
  }
  return righe;
}

/** Legge tutti i "SAL N.xlsx" della cartella. [] se la cartella non esiste. Ogni file fallito è
 *  best-effort (loggato, non blocca gli altri). File senza numero SAL riconoscibile: mai aperti. */
export async function leggiSal(cartella) {
  if (!cartella || !fs.existsSync(cartella)) return [];
  const files = fs.readdirSync(cartella).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));
  const out = [];
  for (const nome of files) {
    const n = numeroSalDaNome(nome);
    if (n == null) continue;
    try {
      const righe = await leggiFileSal(path.join(cartella, nome));
      if (righe.length > 0) out.push({ n, file: nome, righe });
    } catch (e) {
      console.error(`[lim-sync] leggiSal ${nome} fallito: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}
