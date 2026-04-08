// scripts/patch-firenze-template.mjs
// Ri-eseguire con: node scripts/patch-firenze-template.mjs
// Aggiunge {{PLACEHOLDER}} ai campi non ancora patchati nel template Firenze.
// I placeholder già esistenti vengono preservati.

import JSZip from 'jszip';
import fs from 'fs';

const INPUT  = 'public/templates/ALLEGATO_10_FIRENZE.docx';
const OUTPUT = 'public/templates/ALLEGATO_10_FIRENZE.docx';

const buf = fs.readFileSync(INPUT);
const zip = await JSZip.loadAsync(buf);
let xml = await zip.file('word/document.xml').async('string');

let patchCount = 0;

function patch(from, to, label) {
  if (!xml.includes(from)) {
    console.warn(`⚠️  Pattern NON trovato: ${label}`);
    return;
  }
  xml = xml.replace(from, to);
  patchCount++;
  console.log(`✅ ${label}`);
}

// ── 1. Numero pratica: ":" + 93 spazi → {{NUMERO_PRATICA}} ──────────────────
// Il blank è "<w:t xml:space="preserve">: [93 spazi]</w:t>"
patch(
  '<w:t xml:space="preserve">:' + ' '.repeat(93) + '</w:t>',
  '<w:t xml:space="preserve">: {{NUMERO_PRATICA}}</w:t>',
  'Numero pratica → {{NUMERO_PRATICA}}'
);

// ── 2. Eseguito il: 36 spazi → {{ESEGUITO_DATA}} ────────────────────────────
patch(
  '<w:t xml:space="preserve">' + ' '.repeat(36) + '</w:t>',
  '<w:t xml:space="preserve">{{ESEGUITO_DATA}}</w:t>',
  'Eseguito il (36sp) → {{ESEGUITO_DATA}}'
);

// ── 3. Addetto: blank run dopo "detto" (unico nel doc) → {{ADDETTO}} ────────
// "detto" (parte di "Addetto") è unico. Troviamo il primo run sottolineato dopo.
{
  const ANCHOR = 'detto</w:t></w:r>';
  const anchorIdx = xml.indexOf(ANCHOR);
  if (anchorIdx < 0) {
    console.warn('⚠️  Anchor "detto" non trovato');
  } else {
    const after = xml.slice(anchorIdx + ANCHOR.length);
    // Il blank sottolineato è il PRIMO <w:t> con 1 spazio che ha <w:u> nel suo rPr
    const blankPattern = /(<w:r[^>]*><w:rPr>(?:<[^>]+>)*<w:u w:val="single"[^>]*\/>(?:<[^>]+>)*<\/w:rPr>)<w:t xml:space="preserve"> <\/w:t>(<\/w:r>)/;
    const m = blankPattern.exec(after);
    if (!m) {
      console.warn('⚠️  Blank sottolineato dopo "detto" non trovato');
    } else {
      const replacement = m[1] + '<w:t xml:space="preserve">{{ADDETTO}}</w:t>' + m[2];
      xml = xml.slice(0, anchorIdx + ANCHOR.length) + after.replace(blankPattern, replacement);
      patchCount++;
      console.log('✅ Addetto → {{ADDETTO}}');
    }
  }
}

// ── 4. Matricola contatore esistente: primo "ola:" → {{MATRICOLA_ESISTENTE}} ─
// "ola:" appare 2 volte nel doc (Matricola esistente e Matricola nuova).
// La PRIMA è il contatore esistente (quella da compilare con NUMERO_SERIE).
{
  const ANCHOR = 'ola:</w:t></w:r>';
  const anchorIdx = xml.indexOf(ANCHOR);
  if (anchorIdx < 0) {
    console.warn('⚠️  Anchor "ola:" non trovato');
  } else {
    const after = xml.slice(anchorIdx + ANCHOR.length);
    const blankPattern = /(<w:r[^>]*><w:rPr>(?:<[^>]+>)*<w:u w:val="single"[^>]*\/>(?:<[^>]+>)*<\/w:rPr>)<w:t xml:space="preserve"> <\/w:t>(<\/w:r>)/;
    const m = blankPattern.exec(after);
    if (!m) {
      console.warn('⚠️  Blank sottolineato dopo prima "ola:" non trovato');
    } else {
      const replacement = m[1] + '<w:t xml:space="preserve">{{MATRICOLA_ESISTENTE}}</w:t>' + m[2];
      xml = xml.slice(0, anchorIdx + ANCHOR.length) + after.replace(blankPattern, replacement);
      patchCount++;
      console.log('✅ Matricola contatore esistente → {{MATRICOLA_ESISTENTE}}');
    }
  }
}

zip.file('word/document.xml', xml);
const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(OUTPUT, out);

console.log(`\n📄 Template aggiornato: ${patchCount} nuovi placeholder aggiunti.`);
console.log('📋 Placeholder attuali nel template:');
const phs = [...new Set(xml.match(/\{\{[^}]+\}\}/g) || [])].sort();
phs.forEach(p => console.log('  ' + p));
