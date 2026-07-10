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

/** Lettera colonna, nella riga `rigaN`, del primo header il cui testo == nome; null se assente.
 *  Confronto TOLLERANTE (via norm: maiuscolo, senza spazi): così un master rigenerato in Excel con
 *  casing/spaziatura diversi da config ("Ordine" vs "ORDINE", "stato odl" vs "Stato ODL") aggancia
 *  comunque, invece di far fallire il giro con "colonne non trovate". */
function colonnaDaHeader(headerXml, nome, ss, rigaN) {
  if (!nome) return null;
  const bersaglio = norm(nome);
  const re = new RegExp(`<c r="([A-Z]+)${rigaN}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`, 'g');
  for (const hc of headerXml.matchAll(re)) {
    if (norm(valoreCella({ attrs: hc[2] || '', inner: hc[3] || '' }, ss)) === bersaglio) return hc[1];
  }
  return null;
}

/** Prima riga (in ordine di documento, entro `maxScan`) che contiene TUTTI i `nomi`.
 *  Ritorna { riga, xml } (riga 1-based) o { riga: 0, xml: '' } se nessuna combacia.
 *  NB: l'intestazione del master non è garantita sulla riga 1 (può esserci una riga-titolo sopra). */
function trovaRigaHeader(sheet, ss, nomi, maxScan = 15) {
  let visti = 0;
  for (const rm of sheet.matchAll(/<row r="(\d+)"[\s\S]*?<\/row>/g)) {
    if (++visti > maxScan) break;
    const n = +rm[1];
    if (nomi.every((nome) => colonnaDaHeader(rm[0], nome, ss, n) != null)) return { riga: n, xml: rm[0] };
  }
  return { riga: 0, xml: '' };
}

// Ciclo di vita ACEA dell'ordine (rank più alto = più avanzato). Serve a deduplicare gli ODL che
// nell'export compaiono su più righe (una per operazione): a parità di Ordine si tiene lo stato più
// avanzato, così "Intervento Richiesto" (il baseline) non sovrascrive mai uno stato reale per via
// dell'ordine delle righe. Stato SCONOSCIUTO: appena sopra "Intervento Richiesto" (è comunque un
// avanzamento) ma sotto ogni stato noto più avanzato.
const RANK_STATO = {
  INTERVENTORICHIESTO: 10,
  ASSEGNATO: 30,
  RICEVUTO: 40,
  INVIAGGIO: 50,
  SULPOSTO: 60,
  INIZIATO: 70,
  SOSPENSIONE: 80,
  ANNULLATO: 90,
  COMPLETATO: 100,
};
const RANK_SCONOSCIUTO = 20;
function rankStato(s) {
  const k = norm(s); // norm: maiuscolo, senza spazi → "Intervento Richiesto" → "INTERVENTORICHIESTO"
  if (k === '') return -1;
  return RANK_STATO[k] ?? RANK_SCONOSCIUTO;
}
/** A parità di chiave ODL tiene lo stato più avanzato; a parità di rank il primo visto (stabile). */
function statoPiuAvanzato(a, b) {
  return rankStato(b) > rankStato(a) ? b : a;
}

/** Compone il marcatore Automazione aggiungendo i tag mancanti, senza duplicarli né perdere quelli
 *  già presenti da giri precedenti. Es.: '' + ['Stato Operazione'] → 'SI + Stato Operazione';
 *  'SI + Stato Operazione' + ['Saracinesca'] → 'SI + Stato Operazione + Saracinesca'; se un tag è
 *  già presente resta invariato (idempotente, niente doppioni). */
function componiAutomazione(valoreEsistente, tagsDaAggiungere) {
  const pulisci = (s) => String(s ?? '').trim();
  const esistenti = pulisci(valoreEsistente)
    .split('+')
    .map(pulisci)
    .filter((s) => s && s !== 'SI');
  for (const tag of tagsDaAggiungere) {
    const t = pulisci(tag);
    if (t && !esistenti.includes(t)) esistenti.push(t);
  }
  return ['SI', ...esistenti].join(' + ');
}

/**
 * Aggiorna in modo chirurgico masterPath: per ogni ODL agganciato che cambia, scrive lo
 * Stato Operazione e (se masterColonnaAutomazione è data) il marcatore "SI + <colonna>".
 * Se masterColonnaSaracinesca + saracinescaMap sono dati, scrive anche "SI" nella colonna
 * Saracinesca per OGNI riga con un Ordine presente in saracinescaMap — indipendentemente dal
 * cambio di Stato Operazione in questo giro (riempi-vuote: mai sovrascrive un valore diverso già
 * presente, lo segnala come conflitto).
 * @returns {Promise<{erroreColonne:boolean, aggiornate:number, invariate:number, daChiedere:number,
 *   saracinescaScritte:number, conflitti:object[], nonAgganciate:string[], righe:object[]}>}
 */
export async function aggiornaStatoXlsx(masterPath, righeExport, {
  foglio, masterColonnaOdl, masterColonnaStato, masterColonnaAutomazione,
  masterColonnaSaracinesca, saracinescaMap, daChiedere, backup,
}) {
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

  // 2) riga di intestazione rilevata in modo dinamico (la prima, entro le prime righe, che contiene
  //    sia la colonna Ordine sia la colonna Stato) → poi le lettere colonna da QUELLA riga.
  const { riga: rigaHeader, xml: headerRow } = trovaRigaHeader(
    sheet, ss, [masterColonnaOdl, masterColonnaStato].filter(Boolean),
  );
  const colOdl = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaOdl, ss, rigaHeader) : null;
  const colStato = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaStato, ss, rigaHeader) : null;
  const colAutomazione = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaAutomazione, ss, rigaHeader) : null; // opzionale
  const colSaracinesca = rigaHeader ? colonnaDaHeader(headerRow, masterColonnaSaracinesca, ss, rigaHeader) : null; // opzionale
  if (!colOdl || !colStato) {
    return { erroreColonne: true, aggiornate: 0, invariate: 0, nonAgganciate: [], righe: [] };
  }

  // 3) indice export per ODL. L'export è a livello OPERAZIONE: lo stesso Ordine può comparire su più
  //    righe → a parità di Ordine si tiene lo stato più avanzato (deterministico, niente "ultimo vince").
  const mappa = new Map();
  for (const r of righeExport) {
    if (!r.ordine) continue;
    const prev = mappa.get(r.ordine);
    mappa.set(r.ordine, prev === undefined ? r.stato : statoPiuAvanzato(prev, r.stato));
  }

  // 4) scorri le righe dati, raccogli le sostituzioni
  const visti = new Set();
  let aggiornate = 0;
  let invariate = 0;
  let daChiedereScritte = 0;
  let saracinescaScritte = 0;
  const righe = [];
  const conflitti = [];
  const sostituzioni = [];
  const sAttrDi = (cella) => (cella ? ((cella.attrs.match(/\bs="[^"]*"/) || [''])[0]) : '');
  for (const rm of sheet.matchAll(/<row r="(\d+)"[\s\S]*?<\/row>/g)) {
    const n = +rm[1];
    if (n <= rigaHeader) continue; // salta riga-titolo + intestazione
    const ordine = norm(valoreCella(trovaCella(rm[0], `${colOdl}${n}`), ss));
    if (!ordine) continue;
    const statoCell = trovaCella(rm[0], `${colStato}${n}`);
    const precedente = String(valoreCella(statoCell, ss)).trim();

    const tagsAutomazione = [];
    let toccataStato = false;

    if (mappa.has(ordine)) {
      visti.add(ordine);
      const nuovo = String(mappa.get(ordine) ?? '').trim();
      if (precedente === nuovo) {
        invariate++;
      } else {
        sostituzioni.push({ ref: `${colStato}${n}`, vecchia: statoCell ? statoCell.full : null, nuova: cellaInline(`${colStato}${n}`, sAttrDi(statoCell), nuovo), riga: n });
        tagsAutomazione.push(masterColonnaStato);
        toccataStato = true;
        aggiornate++;
        righe.push({
          riga: n, odl: ordine, tipo: 'acea-stato', comune: '', matricola: '',
          esecutore: '', esito: nuovo, sigillo: '', data: '', note: precedente ? `era: ${precedente}` : '',
        });
      }
    } else if (daChiedere && precedente === '') {
      // ODL non presente nell'export (aggiunto a mano) + stato vuoto → "DA CHIEDERE"
      sostituzioni.push({ ref: `${colStato}${n}`, vecchia: statoCell ? statoCell.full : null, nuova: cellaInline(`${colStato}${n}`, sAttrDi(statoCell), 'DA CHIEDERE'), riga: n });
      daChiedereScritte++;
      righe.push({
        riga: n, odl: ordine, tipo: 'da-chiedere', comune: '', matricola: '',
        esecutore: '', esito: 'DA CHIEDERE', sigillo: '', data: '', note: '',
      });
    }

    // Saracinesca (dal nostro DB): indipendente dal cambio di stato in questo giro. Riempi-vuote,
    // mai sovrascrive un valore diverso già presente (protegge un dato compilato a mano).
    let toccataSaracinesca = false;
    if (colSaracinesca && saracinescaMap && saracinescaMap.has(ordine)) {
      const saraCell = trovaCella(rm[0], `${colSaracinesca}${n}`);
      const precedenteSara = String(valoreCella(saraCell, ss)).trim();
      const nuovoSara = String(saracinescaMap.get(ordine) ?? '').trim();
      if (precedenteSara === '') {
        sostituzioni.push({ ref: `${colSaracinesca}${n}`, vecchia: saraCell ? saraCell.full : null, nuova: cellaInline(`${colSaracinesca}${n}`, sAttrDi(saraCell), nuovoSara), riga: n });
        tagsAutomazione.push('Saracinesca');
        toccataSaracinesca = true;
        saracinescaScritte++;
      } else if (precedenteSara !== nuovoSara) {
        conflitti.push({ riga: n, odl: ordine, campo: 'saracinesca', esistente: precedenteSara, nuovo: nuovoSara });
      }
    }

    // marcatore Automazione: integra i tag di ciò che è stato scritto su QUESTA riga in questo giro,
    // senza mai perdere i tag già presenti da giri precedenti (componiAutomazione legge la cella).
    if (colAutomazione && tagsAutomazione.length > 0) {
      const autoCell = trovaCella(rm[0], `${colAutomazione}${n}`);
      const valoreEsistente = String(valoreCella(autoCell, ss)).trim();
      const nuovoAuto = componiAutomazione(valoreEsistente, tagsAutomazione);
      if (nuovoAuto !== valoreEsistente) {
        sostituzioni.push({ ref: `${colAutomazione}${n}`, vecchia: autoCell ? autoCell.full : null, nuova: cellaInline(`${colAutomazione}${n}`, sAttrDi(autoCell), nuovoAuto), riga: n });
      }
    }

    if (toccataSaracinesca && !toccataStato) {
      righe.push({
        riga: n, odl: ordine, tipo: 'acea-saracinesca', comune: '', matricola: '',
        esecutore: '', esito: '', sigillo: '', data: '', note: '',
      });
    }
  }

  const nonAgganciate = [...mappa.keys()].filter((o) => !visti.has(o));

  // 5) nessuna modifica → non toccare il file (niente write, niente backup)
  if (sostituzioni.length === 0) {
    return { erroreColonne: false, aggiornate: 0, invariate, daChiedere: 0, saracinescaScritte: 0, conflitti, nonAgganciate, righe: [] };
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

  return { erroreColonne: false, aggiornate, invariate, daChiedere: daChiedereScritte, saracinescaScritte, conflitti, nonAgganciate, righe };
}
