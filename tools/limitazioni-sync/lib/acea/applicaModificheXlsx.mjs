// tools/limitazioni-sync/lib/acea/applicaModificheXlsx.mjs
// Patcher CHIRURGICO generale per i master xlsx della sync: applica un change-set
// (aggiornamenti di celle su righe esistenti + righe nuove da appendere) modificando
// SOLO le parti necessarie del foglio e lasciando byte-identico tutto il resto
// (AutoFiltro, formattazione, altri fogli). Evita la corruzione + perdita AutoFiltro
// che exceljs causa ri-serializzando l'intero file.
//
// Change-set:
//   aggiornamenti: [{ riga, col, valore, tipo }]   riga=numero riga xlsx, col=indice 0-based
//   nuoveRighe:    [ [{ col, valore, tipo }], … ]   ogni elemento = una riga nuova
//   tipo: 'str' (default) | 'date' (Date → seriale Excel con lo stile della colonna)
import fs from 'node:fs';
import JSZip from 'jszip';

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Indice 0-based → lettera colonna (0→A, 26→AA). */
function lettera(idx) {
  let n = idx + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Lettere colonna → numero 1-based. */
function colNum(ref) {
  const lett = (ref.match(/^([A-Z]+)/) || ['', ''])[1];
  let n = 0;
  for (const ch of lett) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Seriale Excel (giorni da 1899-12-30) per una data; calcolo in UTC sul giorno locale. */
function excelSerial(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const utc = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

/** XML di una cella (null se valore vuoto). Stringa→inlineStr; data→seriale numerico. */
function cellaXml(ref, sAttr, valore, tipo) {
  if (valore == null || valore === '') return null;
  if (tipo === 'date') {
    const serial = excelSerial(valore);
    if (serial == null) return null;
    return `<c r="${ref}"${sAttr ? ' ' + sAttr : ''}><v>${serial}</v></c>`;
  }
  return `<c r="${ref}"${sAttr ? ' ' + sAttr : ''} t="inlineStr"><is><t xml:space="preserve">${escapeXml(valore)}</t></is></c>`;
}

/** Trova la cella r="REF" nello XML. Ritorna { full, attrs } o null. */
function trovaCella(xml, ref) {
  const m = xml.match(new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`));
  return m ? { full: m[0], attrs: m[1] || '' } : null;
}

/** Inserisce nuovaCella nello XML di una riga rispettando l'ordine di colonna. */
function inserisciInOrdine(rowXml, ref, nuovaCella) {
  const target = colNum(ref);
  for (const c of rowXml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    if (colNum(c[1]) > target) return rowXml.replace(c[0], nuovaCella + c[0]);
  }
  return rowXml.replace(/<\/row>\s*$/, nuovaCella + '</row>');
}

/** numFmtId considerati "data": built-in (14-17,22) + custom con codice di data. */
function numFmtIdData(styles) {
  const ids = new Set([14, 15, 16, 17, 22]);
  for (const m of styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)) {
    const code = m[2].toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
    if (/[dy]/.test(code)) ids.add(+m[1]);
  }
  return ids;
}

/** Indice di uno stile con formato-data; lo crea (numFmtId 14) se assente. Modifica styles.xml solo se serve. */
async function ensureDateStyle(zip) {
  const sf = zip.file('xl/styles.xml');
  if (!sf) return null;
  let styles = await sf.async('string');
  const dateIds = numFmtIdData(styles);
  const cellXfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
  const xfs = [...cellXfs.matchAll(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g)].map((m) => m[0]);
  for (let i = 0; i < xfs.length; i++) {
    const id = +((xfs[i].match(/numFmtId="(\d+)"/) || [])[1] ?? -1);
    if (dateIds.has(id)) return { idx: i };
  }
  const count = +((styles.match(/<cellXfs count="(\d+)"/) || [])[1] ?? xfs.length);
  styles = styles.replace(/(<cellXfs count=")(\d+)(")/, `$1${count + 1}$3`);
  styles = styles.replace('</cellXfs>', '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>');
  zip.file('xl/styles.xml', styles);
  return { idx: count };
}

async function risolviSheetPath(zip, foglio) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetEl = (wb.match(new RegExp(`<sheet[^>]*name="${foglio}"[^>]*/>`)) || [])[0];
  if (!sheetEl) throw new Error(`Foglio "${foglio}" non trovato nel master.`);
  const rid = (sheetEl.match(/r:id="([^"]+)"/) || [])[1];
  const target = (rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1];
  return 'xl/' + String(target).replace(/^\/?xl\//, '').replace(/^\/?/, '');
}

/**
 * Applica il change-set in modo chirurgico. Scrive il file solo se ci sono modifiche.
 * @returns {Promise<{aggiornate:number, righeNuove:number}>}
 */
export async function applicaModificheXlsx(masterPath, { foglio, aggiornamenti = [], nuoveRighe = [] }, { backup } = {}) {
  if (aggiornamenti.length === 0 && nuoveRighe.length === 0) {
    return { aggiornate: 0, righeNuove: 0 };
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(masterPath));
  const sheetPath = await risolviSheetPath(zip, foglio);
  let sheet = await zip.file(sheetPath).async('string');

  // ultima riga esistente
  let maxRiga = 0;
  for (const m of sheet.matchAll(/<row r="(\d+)"/g)) maxRiga = Math.max(maxRiga, +m[1]);

  // stile campione per colonna (da una riga dati esistente) per le righe nuove
  const stileCol = new Map();
  const rigaCamp = (sheet.match(/<row r="2"[\s\S]*?<\/row>/) || [''])[0];
  for (const c of rigaCamp.matchAll(/<c r="([A-Z]+)2"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const s = (c[2].match(/\bs="[^"]*"/) || [''])[0];
    if (s) stileCol.set(colNum(c[1]) - 1, s);
  }

  // stile-data (per le celle 'date' senza un proprio formato-data: es. celle prima vuote o righe nuove)
  let dateFallbackAttr = '';
  if (aggiornamenti.some((u) => u.tipo === 'date') || nuoveRighe.some((r) => r.some((c) => c.tipo === 'date'))) {
    const ds = await ensureDateStyle(zip);
    if (ds) dateFallbackAttr = `s="${ds.idx}"`;
  }
  const stilePer = (col, tipo, ownS) =>
    tipo === 'date'
      ? (stileCol.get(col) || dateFallbackAttr || ownS || '')
      : (ownS || stileCol.get(col) || '');

  // 1) aggiornamenti su righe esistenti
  let aggiornate = 0;
  for (const u of aggiornamenti) {
    const ref = lettera(u.col) + u.riga;
    const esistente = trovaCella(sheet, ref);
    const ownS = esistente ? ((esistente.attrs.match(/\bs="[^"]*"/) || [''])[0]) : '';
    const sAttr = stilePer(u.col, u.tipo, ownS);
    const nuova = cellaXml(ref, sAttr, u.valore, u.tipo);
    if (nuova) {
      if (esistente) {
        sheet = sheet.replace(esistente.full, nuova);
      } else {
        sheet = sheet.replace(new RegExp(`<row r="${u.riga}"[\\s\\S]*?</row>`), (rowXml) => inserisciInOrdine(rowXml, ref, nuova));
      }
      aggiornate++;
    } else if (esistente) {
      // valore vuoto su cella esistente → svuota (self-closing, stile preservato)
      sheet = sheet.replace(esistente.full, `<c r="${ref}"${sAttr ? ' ' + sAttr : ''}/>`);
      aggiornate++;
    }
  }

  // 2) righe nuove appese dopo maxRiga (celle in ordine di colonna)
  let nRiga = maxRiga;
  const righeXml = [];
  for (const celle of nuoveRighe) {
    nRiga++;
    const cells = [...celle]
      .sort((a, b) => a.col - b.col)
      .map((c) => cellaXml(lettera(c.col) + nRiga, stilePer(c.col, c.tipo, ''), c.valore, c.tipo))
      .filter(Boolean);
    righeXml.push(`<row r="${nRiga}">${cells.join('')}</row>`);
  }
  if (righeXml.length) {
    sheet = sheet.replace('</sheetData>', righeXml.join('') + '</sheetData>');
    // estendi <dimension> e <autoFilter> all'ultima riga nuova
    sheet = sheet.replace(/(<dimension ref="[A-Z]+1:[A-Z]+)\d+("\s*\/>)/, `$1${nRiga}$2`);
    sheet = sheet.replace(/(<autoFilter ref="[A-Z]+1:[A-Z]+)\d+(")/, `$1${nRiga}$2`);
  }

  zip.file(sheetPath, sheet);
  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (typeof backup === 'function') backup();
  fs.writeFileSync(masterPath, outBuf);

  return { aggiornate, righeNuove: righeXml.length };
}
