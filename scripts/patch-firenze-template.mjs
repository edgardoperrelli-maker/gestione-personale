// scripts/patch-firenze-template.mjs
// Eseguire con: node scripts/patch-firenze-template.mjs
// Modifica public/templates/ALLEGATO_10_FIRENZE.docx aggiungendo placeholder {{...}}

import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

const INPUT  = 'public/templates/ALLEGATO_10_FIRENZE.docx';
const OUTPUT = 'public/templates/ALLEGATO_10_FIRENZE.docx'; // sovrascrive

const buf = fs.readFileSync(INPUT);
const zip = await JSZip.loadAsync(buf);
let xml = await zip.file('word/document.xml').async('string');

/**
 * Ogni chiave è il numero ESATTO di spazi nel tag <w:t>; il valore è il placeholder.
 * MAPPATURA VERIFICATA sull'XML originale:
 *   219sp → dopo "Nome:"        → nome del cliente
 *    33sp → dopo "Indirizzo:"   → via/indirizzo
 *    60sp → dopo "Comune:" (riga 1 continuazione) → comune  ← ⚠️ verificare aprendo il .docx dopo il patch
 *    28sp → quarto campo riga 1 → da verificare
 *    31sp → dopo "Telefono:"    → recapito telefonico
 *    87sp → dopo "Telefono:" riga 2 → da verificare
 *    17sp → dopo "Pdr:"         → numero PDR
 *    76sp → dopo "Pdr:" riga 2  → da verificare
 *    84sp → campo Numero pratica/ODS → da verificare
 *    80sp → campo Data richiesta → da verificare
 *
 * Dopo aver eseguito lo script, aprire il .docx in Word e verificare
 * dove appare ogni placeholder; aggiustare la mappatura in fillFirenzeAllegato10()
 * di conseguenza.
 */
const REPLACEMENTS = {
  219: 'NOME_UTENTE',
   33: 'STRADA',
   60: 'NOME_LOCALITA',
   28: 'CAMPO_28',        // ⚠️ da identificare
   14: 'CAMPO_14',        // ⚠️ da identificare
    9: 'CAMPO_9',         // ⚠️ da identificare
   57: 'CAMPO_57',        // ⚠️ da identificare
   31: 'RECAPITO',
   87: 'CAMPO_87',        // ⚠️ da identificare
   17: 'PDR',
   76: 'CAMPO_76',        // ⚠️ da identificare
   84: 'ODS',
   11: 'CAMPO_11',        // ⚠️ da identificare
   80: 'DATA',
};

for (const [spaces, placeholder] of Object.entries(REPLACEMENTS)) {
  const spaceStr = ' '.repeat(Number(spaces));
  const from = `<w:t xml:space="preserve">${spaceStr}</w:t>`;
  const to   = `<w:t xml:space="preserve">{{${placeholder}}}</w:t>`;
  if (!xml.includes(from)) {
    console.warn(`⚠️  Sequenza ${spaces}sp NON trovata — template cambiato?`);
    continue;
  }
  xml = xml.replace(from, to);
  console.log(`✅ ${spaces}sp → {{${placeholder}}}`);
}

zip.file('word/document.xml', xml);
const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(OUTPUT, out);
console.log(`\n📄 Template patchato salvato in ${OUTPUT}`);
console.log('👉 Aprirlo in Word per verificare la posizione di ogni {{PLACEHOLDER}}');
