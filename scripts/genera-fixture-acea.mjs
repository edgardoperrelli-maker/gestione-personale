// scripts/genera-fixture-acea.mjs
// Genera la fixture anonimizzata dell'export ACEA a partire da un export reale.
//
//   node scripts/genera-fixture-acea.mjs <export-reale.xlsx> [destinazione.xlsx]
//
// L'export reale contiene indirizzi di clienti ACEA e nominativi di operatori: NON entra nel
// repository. Questo script ne estrae un campione che copre tutti i casi limite del parsing e
// sostituisce i soli campi personali (via, civico, CAP, nominativi, note libere). ODL, impianto,
// matricola, date, stati, attività e importi restano REALI: sono la materia su cui girano i test
// e non sono dati personali.
//
// I casi coperti sono elencati in CASI: ognuno ha un predicato e un numero massimo di righe.
// Se un caso non trova righe lo script lo segnala e continua — così un export futuro con meno
// varietà non blocca la rigenerazione, ma si vede subito cosa manca.
import ExcelJS from 'exceljs';
import path from 'node:path';

const IN = process.argv[2];
const OUT = process.argv[3] ?? 'docs/fixtures/acea/export-campione.xlsx';
if (!IN) {
  console.error('Uso: node scripts/genera-fixture-acea.mjs <export-reale.xlsx> [destinazione.xlsx]');
  process.exit(1);
}

/** Testo da una cella exceljs (rich text / formula / hyperlink / data / scalare). */
const testo = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
  }
  return String(v);
};

const wbIn = new ExcelJS.Workbook();
await wbIn.xlsx.readFile(IN);
const wsIn = wbIn.worksheets[0];
const header = (wsIn.getRow(1).values || []).slice(1).map((c) => testo(c).trim());

// Righe come oggetti { nomeColonna: valoreGrezzo } + indice di riga originale.
const righe = [];
for (let r = 2; r <= wsIn.rowCount; r++) {
  const row = wsIn.getRow(r);
  const o = { __riga: r, __valori: [] };
  header.forEach((h, i) => {
    const raw = row.getCell(i + 1).value;
    o.__valori[i] = raw;
    if (h) o[h] = testo(raw).trim();
  });
  if (o['Ordine']) righe.push(o);
}
console.log(`Export letto: ${righe.length} righe, ${header.length} colonne.`);

const t = (r, c) => String(r[c] ?? '');
const testoOrdine = (r) => t(r, 'Testo breve Ordine');
const attivita = (r) => t(r, 'Operazione testo breve');
const stato = (r) => t(r, 'Stato Operazione');

// ─────────────────────────────────────────────────────────────────────────────
// Casi limite da coprire. L'ordine conta solo per la leggibilità del campione.
// ─────────────────────────────────────────────────────────────────────────────
const CASI = [
  // --- marcatore LIM_MAS_MATR, con "LENTE" troncato a lunghezze diverse -----
  ['massive: LEN (troncato)', (r) => /_LIM_MAS_MATR_\d+_LEN$/.test(testoOrdine(r)), 2],
  ['massive: LENT (troncato)', (r) => /_LIM_MAS_MATR_\d+_LENT$/.test(testoOrdine(r)), 1],
  ['massive: LENTE_MM_ (troncato)', (r) => /_LENTE_MM_$/.test(testoOrdine(r)), 1],
  ['massive: LENTE_M (troncato)', (r) => /_LENTE_M$/.test(testoOrdine(r)), 1],
  // --- matricole di forma non numerica --------------------------------------
  ['massive: matricola con lettera finale (123324A)', (r) => /_LIM_MAS_MATR_\d+[A-Z]_LENTE/.test(testoOrdine(r)), 1],
  ['massive: matricola con prefisso alfabetico (OA/GH/GV)', (r) => /_LIM_MAS_MATR_[A-Z]{1,2}\d+_/.test(testoOrdine(r)), 2],
  ['massive: matricola tipo 99AO23231', (r) => /_LIM_MAS_MATR_\d+AO\d+/.test(testoOrdine(r)), 1],
  // --- marcatore LIM_MASS (formato recente, impianti 4004*) -----------------
  ['massive: LIM_MASS _MM_n', (r) => /_LIM_MASS_\d+_MM_\d/.test(testoOrdine(r)), 2],
  ['massive: LIM_MASS con trattino (04-228458)', (r) => /_LIM_MASS_\d+-\d+_MM_/.test(testoOrdine(r)), 1],
  ['massive: LIM_MASS MIS-E392-3017', (r) => /_LIM_MASS_MIS-/.test(testoOrdine(r)), 1],
  // --- saracinesche ----------------------------------------------------------
  ['saracinesca: SOST_SARAC_SER maiuscolo', (r) => /_SOST_SARAC_SER_\d+$/.test(testoOrdine(r)), 2],
  ['saracinesca: Sost_Sarac_ser minuscolo con trattino', (r) => /_Sost_Sarac_ser_/.test(testoOrdine(r)), 1],
  ['saracinesca: matricola alfanumerica', (r) => /_SOST_SARAC_SER_\d+[A-Z]$/.test(testoOrdine(r)), 1],
  // TRAPPOLA: attività saracinesca ma marcatore LIM_MAS_MATR (il marcatore NON dice l'attività)
  ['saracinesca con marcatore LIM_MAS_MATR (trappola)',
    (r) => attivita(r) === 'Sostituzione saracinesca o valvola' && /_LIM_MAS_MATR_/.test(testoOrdine(r)), 2],
  // --- dunning con matricola nella colonna dedicata --------------------------
  ['dunning: matricola in colonna', (r) => attivita(r) === 'Limitazione flusso idrico' && t(r, 'Matricola misuratore') !== '', 2],
  ['dunning: matricola 16 caratteri (WTTS…)', (r) => /^WTTS/.test(t(r, 'Matricola misuratore')), 1],
  // --- verifiche da ufficio: impianto assente o in forma libera --------------
  ['AVUF: senza impianto né matricola', (r) => t(r, 'Tipo di ordine') === 'AVUF' && t(r, 'Impianto') === '' && t(r, 'Matricola misuratore') === '', 2],
  ['AVUF: impianto in forma libera (CESSATI N. IMPIANTO)', (r) => /N\.? ?IMPIANTO \d{10}/i.test(testoOrdine(r)), 1],
  // --- revoche escluse dalla consuntivazione --------------------------------
  ['REVO: escluso da consuntivazione con OdM padre',
    (r) => t(r, 'Escludi OdM / Operazione dalla consuntivazione') === 'X' && t(r, 'OdM riferimento') !== '', 2],
  // --- stati -----------------------------------------------------------------
  ['stato ANNL (da eliminare)', (r) => stato(r) === 'ANNL', 2],
  ['stato SOSP (aperto, pianificabile)', (r) => stato(r) === 'SOSP', 2],
  ['stato RICE', (r) => stato(r) === 'RICE', 1],
  ['stato ASGN', (r) => stato(r) === 'ASGN', 1],
  ['stato DAPI non assegnato', (r) => stato(r) === 'DAPI' && t(r, 'Cognome C.I.D.') === '', 2],
  // --- esiti -----------------------------------------------------------------
  ['esito positivo EIES', (r) => t(r, 'Causa dello scostamento') === 'EIES', 2],
  ['esito negativo (LED_RED)', (r) => t(r, 'Icona causa scost.') === 'ICON_LED_RED', 2],
  // --- SLA -------------------------------------------------------------------
  ['SLA RIAT (cardine 1 giorno)', (r) => t(r, 'Codice SLA Appalto') === 'RIAT', 2],
  ['già scaduto alla nascita (fine cardine < pubblicazione)',
    (r) => t(r, 'Data fine cardine') !== '' && t(r, 'Data fine cardine') < t(r, 'Data pubblicazione lavoro'), 2],
];

const scelte = new Map(); // chiave riga → riga
const report = [];
for (const [nome, predicato, max] of CASI) {
  const trovate = righe.filter(predicato).slice(0, max);
  for (const r of trovate) scelte.set(r.__riga, r);
  report.push(`${trovate.length === 0 ? '⚠ ' : '  '}${String(trovate.length).padStart(2)}/${max}  ${nome}`);
}

// Caso speciale: un ODL con DUE operazioni (chiave composta). Va preso in blocco.
const perOdl = new Map();
for (const r of righe) perOdl.set(r['Ordine'], (perOdl.get(r['Ordine']) ?? 0) + 1);
const odlDoppio = [...perOdl.entries()].find(([, n]) => n > 1)?.[0];
if (odlDoppio) {
  for (const r of righe.filter((x) => x['Ordine'] === odlDoppio)) scelte.set(r.__riga, r);
  report.push(`   2/2  ODL con due operazioni (${odlDoppio}) — chiave composta`);
} else {
  report.push('⚠  0/2  ODL con due operazioni — NON TROVATO');
}

console.log('\nCasi coperti:');
for (const r of report) console.log(r);

// ─────────────────────────────────────────────────────────────────────────────
// Anonimizzazione: SOLO i campi personali. Deterministica (stesso input → stesso
// output) così la fixture non cambia a ogni rigenerazione.
// ─────────────────────────────────────────────────────────────────────────────
// Nomi inequivocabilmente fittizi: plausibili per formato e lunghezza (servono ai test di layout)
// ma impossibili da confondere con un toponimo reale, anche per coincidenza.
const VIE = ['VIA ALFA', 'VIA BETA', 'VIALE GAMMA', 'VIA DELTA',
  'LARGO EPSILON', 'VIA ZETA', 'VIA ETA', 'VIALE THETA'];
// Un cognome COMPOSTO è indispensabile: è un caso limite noto del matching operatori.
const COGNOMI = ['ROSSI', 'BIANCHI', 'DE ROSSI', 'VERDI', 'NERI', 'GALLI', 'RUSSO', 'FERRARI'];
const NOMI = ['MARIO', 'LUIGI', 'ANNA', 'PAOLO', 'CHIARA', 'MARCO', 'SARA', 'LUCA'];
const NOTE = ['ok', 'non eseguito', 'intervento eseguito', 'accesso non consentito', ''];

/** Indice stabile derivato da una stringa (hash semplice), per anonimizzare in modo deterministico. */
const idx = (s, mod) => {
  let h = 0;
  for (const ch of String(s ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % mod;
};

const anonimizza = (r) => {
  const seme = r['Ordine'] + r['Numero Operazione'];
  const out = {};
  if (t(r, 'Via')) out['Via'] = VIE[idx(seme, VIE.length)];
  if (t(r, 'N. civico')) out['N. civico'] = String(1 + idx(seme + 'c', 180));
  if (t(r, 'CAP')) out['CAP'] = '00' + String(100 + idx(seme + 'p', 80));
  if (t(r, 'Cognome C.I.D.')) out['Cognome C.I.D.'] = COGNOMI[idx(t(r, 'C.I.D.'), COGNOMI.length)];
  if (t(r, 'Nome C.I.D.')) out['Nome C.I.D.'] = NOMI[idx(t(r, 'C.I.D.'), NOMI.length)];
  if (t(r, 'Direttore Operativo')) out['Direttore Operativo'] = `${COGNOMI[idx(t(r, 'Direttore Operativo'), COGNOMI.length)]} ${NOMI[idx(t(r, 'Direttore Operativo') + 'n', NOMI.length)]}`;
  if (t(r, 'Direttore Operativo di Testata')) out['Direttore Operativo di Testata'] = out['Direttore Operativo'] ?? '';
  if (t(r, 'Testo conferma')) out['Testo conferma'] = NOTE[idx(seme + 'n', NOTE.length)];
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Scrittura: stesso nome foglio, stessa intestazione, stesso ordine di colonne.
// ─────────────────────────────────────────────────────────────────────────────
const wbOut = new ExcelJS.Workbook();
const wsOut = wbOut.addWorksheet(wsIn.name);
wsOut.addRow(header);

const ordinate = [...scelte.values()].sort((a, b) => a.__riga - b.__riga);
for (const r of ordinate) {
  const sostituzioni = anonimizza(r);
  const valori = header.map((h, i) => (h in sostituzioni ? sostituzioni[h] : r.__valori[i] ?? null));
  wsOut.addRow(valori);
}

const dest = path.resolve(OUT);
await wbOut.xlsx.writeFile(dest);
console.log(`\nFixture scritta: ${dest}`);
console.log(`Righe: ${ordinate.length} · colonne: ${header.length} · foglio: "${wsIn.name}"`);
console.log('Campi anonimizzati: Via, N. civico, CAP, Cognome/Nome C.I.D., Direttore Operativo, Testo conferma.');
console.log('Campi REALI (non personali, servono ai test): Ordine, Impianto, Matricola, date, stati, attività, importi.');
