// tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs
// Scrittura CHIRURGICA dello "Stato Operazione" (+ marcatore "Automazione") nel master xlsx.
// Apre l'xlsx come zip (jszip) e modifica SOLO le celle delle righe che cambiano, lasciando
// byte-identico tutto il resto: AutoFiltro, formattazione, ordine righe, altri fogli, sharedStrings,
// styles. Così Excel non deve "riparare" il file (exceljs invece ri-serializza tutto e corrompe
// l'XML + perde l'AutoFiltro).
//
// Il valore nuovo è scritto come INLINE STRING (t="inlineStr"), preservando lo stile (s="…")
// della cella originale. Niente gestione di sharedStrings.
import fs from 'node:fs';
import JSZip from 'jszip';
import { norm } from '../match.mjs';

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeXml = (s) =>
  String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Numero colonna 1-based dalle lettere (A=1, B=2, …, AA=27). */
function colNum(ref) {
  const lettere = (ref.match(/^([A-Z]+)/) || ['', ''])[1];
  let n = 0;
  for (const ch of lettere) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Cella inline-string con stile preservato. */
function cellaInline(ref, sAttr, valore) {
  return `<c r="${ref}"${sAttr ? ' ' + sAttr : ''} t="inlineStr"><is><t xml:space="preserve">${escapeXml(valore)}</t></is></c>`;
}

/** Inserisce nuovaCella nello XML di una riga, rispettando l'ordine di colonna. */
function inserisciInOrdine(rowXml, ref, nuovaCella) {
  const target = colNum(ref);
  for (const c of rowXml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    if (colNum(c[1]) > target) return rowXml.replace(c[0], nuovaCella + c[0]);
  }
  return rowXml.replace(/<\/row>\s*$/, nuovaCella + '</row>');
}

/** sharedStrings.xml → array di testi (concatena i <t> di ogni <si>). */
function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const ts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unescapeXml(x[1]));
    out.push(ts.join(''));
  }
  return out;
}

/** Trova la cella r="REF" in uno spezzone XML. Ritorna { full, attrs, inner, selfClose } o null. */
function trovaCella(xml, ref) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = xml.match(re);
  if (!m) return null;
  return { full: m[0], attrs: m[1] || '', inner: m[2] || '', selfClose: m[0].endsWith('/>') };
}

/** Valore testuale di una cella, risolvendo le shared string. */
function valoreCella(cella, ss) {
  if (!cella) return '';
  const t = (cella.attrs.match(/\bt="([^"]+)"/) || [])[1];
  if (t === 's') {
    const i = (cella.inner.match(/<v>(\d+)<\/v>/) || [])[1];
    return i != null ? (ss[+i] ?? '') : '';
  }
  if (t === 'inlineStr') {
    const x = (cella.inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
    return unescapeXml(x ?? '');
  }
  // 'str' (formula) o numero
  const v = (cella.inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  return v ?? '';
}

/** Lettera colonna del primo header (riga 1) il cui testo == nome; null se assente. */
function colonnaDaHeader(headerRow, nome, ss) {
  if (!nome) return null;
  for (const hc of headerRow.matchAll(/<c r="([A-Z]+)1"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    if (valoreCella({ attrs: hc[2] || '', inner: hc[3] || '' }, ss) === nome) return hc[1];
  }
  return null;
}

/**
 * Aggiorna in modo chirurgico masterPath: per ogni ODL agganciato che cambia, scrive lo
 * Stato Operazione e (se masterColonnaAutomazione è data) il marcatore "SI + <colonna>".
 * @returns {Promise<{erroreColonne:boolean, aggiornate:number, invariate:number, nonAgganciate:string[], righe:object[]}>}
 */
export async function aggiornaStatoXlsx(masterPath, righeExport, { foglio, masterColonnaOdl, masterColonnaStato, masterColonnaAutomazione, backup }) {
  const zip = await JSZip.loadAsync(fs.readFileSync(masterPath));

  // 1) risolvi il foglio → sheetN.xml
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetEl = (wb.match(new RegExp(`<sheet[^>]*name="${foglio}"[^>]*/>`)) || [])[0];
  if (!sheetEl) throw new Error(`Foglio "${foglio}" non trovato nel master.`);
  const rid = (sheetEl.match(/r:id="([^"]+)"/) || [])[1];
  const target = (rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1];
  const sheetPath = 'xl/' + String(target).replace(/^\/?xl\//, '').replace(/^\/?/, '');
  let sheet = await zip.file(sheetPath).async('string');

  const ssFile = zip.file('xl/sharedStrings.xml');
  const ss = ssFile ? parseSharedStrings(await ssFile.async('string')) : [];

  // 2) lettere colonna dalla riga 1
  const headerRow = (sheet.match(/<row r="1"[\s\S]*?<\/row>/) || [''])[0];
  const colOdl = colonnaDaHeader(headerRow, masterColonnaOdl, ss);
  const colStato = colonnaDaHeader(headerRow, masterColonnaStato, ss);
  const colAutomazione = colonnaDaHeader(headerRow, masterColonnaAutomazione, ss); // opzionale
  if (!colOdl || !colStato) {
    return { erroreColonne: true, aggiornate: 0, invariate: 0, nonAgganciate: [], righe: [] };
  }

  // 3) indice export per ODL
  const mappa = new Map();
  for (const r of righeExport) if (r.ordine) mappa.set(r.ordine, r.stato);

  // 4) scorri le righe dati, raccogli le sostituzioni
  const visti = new Set();
  let aggiornate = 0;
  let invariate = 0;
  const righe = [];
  const sostituzioni = [];
  for (const rm of sheet.matchAll(/<row r="(\d+)"[\s\S]*?<\/row>/g)) {
    const n = +rm[1];
    if (n === 1) continue;
    const ordine = norm(valoreCella(trovaCella(rm[0], `${colOdl}${n}`), ss));
    if (!ordine || !mappa.has(ordine)) continue;
    visti.add(ordine);
    const nuovo = String(mappa.get(ordine) ?? '').trim();
    const statoCell = trovaCella(rm[0], `${colStato}${n}`);
    const precedente = String(valoreCella(statoCell, ss)).trim();
    if (precedente === nuovo) { invariate++; continue; }

    const sAttr = statoCell ? ((statoCell.attrs.match(/\bs="[^"]*"/) || [''])[0]) : '';
    sostituzioni.push({ ref: `${colStato}${n}`, vecchia: statoCell ? statoCell.full : null, nuova: cellaInline(`${colStato}${n}`, sAttr, nuovo), riga: n });

    // marcatore Automazione: "SI + <colonna toccata>" (come la sync su Zagarolo)
    if (colAutomazione) {
      const autoCell = trovaCella(rm[0], `${colAutomazione}${n}`);
      const aAttr = autoCell ? ((autoCell.attrs.match(/\bs="[^"]*"/) || [''])[0]) : '';
      sostituzioni.push({ ref: `${colAutomazione}${n}`, vecchia: autoCell ? autoCell.full : null, nuova: cellaInline(`${colAutomazione}${n}`, aAttr, `SI + ${masterColonnaStato}`), riga: n });
    }

    aggiornate++;
    righe.push({
      riga: n, odl: ordine, tipo: 'acea-stato', comune: '', matricola: '',
      esecutore: '', esito: nuovo, sigillo: '', data: '', note: precedente ? `era: ${precedente}` : '',
    });
  }

  const nonAgganciate = [...mappa.keys()].filter((o) => !visti.has(o));

  // 5) nessuna modifica → non toccare il file (niente write, niente backup)
  if (sostituzioni.length === 0) {
    return { erroreColonne: false, aggiornate: 0, invariate, nonAgganciate, righe: [] };
  }

  // 6) applica le sostituzioni sul testo del foglio (ref unici → replace sicuro; insert in ordine)
  for (const s of sostituzioni) {
    if (s.vecchia) {
      sheet = sheet.replace(s.vecchia, s.nuova);
    } else {
      sheet = sheet.replace(new RegExp(`<row r="${s.riga}"[\\s\\S]*?</row>`), (rowXml) => inserisciInOrdine(rowXml, s.ref, s.nuova));
    }
  }

  // 7) backup (se fornito) POI riscrivi SOLO il foglio modificato; tutto il resto resta invariato
  zip.file(sheetPath, sheet);
  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (typeof backup === 'function') backup();
  fs.writeFileSync(masterPath, outBuf);

  return { erroreColonne: false, aggiornate, invariate, nonAgganciate, righe };
}
