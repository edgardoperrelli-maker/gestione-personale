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

// ── TYPOGRAPHY: leggibilità anagrafica cliente ────────────────────────────────
// Tre paragrafi con firma unica — nessuno spostamento del contenuto sotto.

// P1: riga Nome/Indirizzo/Comune (auto spacing, line=411)
// font sz 15→19 (+2pt) + line 411→325 (compensa per mantenere altezza invariata)
{
  const OLD_SPACING = '<w:spacing w:after="0" w:line="411" w:lineRule="auto"/>';
  const NEW_SPACING = '<w:spacing w:after="0" w:line="325" w:lineRule="auto"/>';
  if (xml.includes(OLD_SPACING)) {
    // Trova il paragrafo intero
    const pStart = xml.lastIndexOf('<w:p ', xml.indexOf(OLD_SPACING));
    const pEnd   = xml.indexOf('</w:p>', xml.indexOf(OLD_SPACING)) + '</w:p>'.length;
    let para = xml.slice(pStart, pEnd);

    // Aumenta font sz 15→19 e szCs 15→19 dentro questo paragrafo
    para = para.replaceAll('<w:sz w:val="15"/>', '<w:sz w:val="19"/>');
    para = para.replaceAll('<w:szCs w:val="15"/>', '<w:szCs w:val="19"/>');
    // Aggiusta la spaziatura riga
    para = para.replace(OLD_SPACING, NEW_SPACING);

    xml = xml.slice(0, pStart) + para + xml.slice(pEnd);
    console.log('✅ P1 (Nome/Indirizzo): sz 15→19, line 411→325');
  } else {
    console.warn('⚠️  P1 spacing non trovata');
  }
}

// P2: righe Telefono/PDR/Numero pratica/Data richiesta (exact, line=170)
// font sz 15→17 (+1pt) — riempie esattamente l'altezza, nessun overflow
{
  const OLD_SPACING = '<w:spacing w:before="3" w:after="0" w:line="170" w:lineRule="exact"/>';
  if (xml.includes(OLD_SPACING)) {
    const pStart = xml.lastIndexOf('<w:p ', xml.indexOf(OLD_SPACING));
    const pEnd   = xml.indexOf('</w:p>', xml.indexOf(OLD_SPACING)) + '</w:p>'.length;
    let para = xml.slice(pStart, pEnd);

    para = para.replaceAll('<w:sz w:val="15"/>', '<w:sz w:val="17"/>');
    para = para.replaceAll('<w:szCs w:val="15"/>', '<w:szCs w:val="17"/>');

    xml = xml.slice(0, pStart) + para + xml.slice(pEnd);
    console.log('✅ P2 (Telefono/PDR/Data): sz 15→17');
  } else {
    console.warn('⚠️  P2 spacing non trovata');
  }
}

// P3: riga Numero richiesta (exact, line=180, già sz=18)
// font sz 18→19 (+0.5pt) — marginalmente più grande, stessa altezza
{
  const OLD_SPACING = '<w:spacing w:before="1" w:after="0" w:line="180" w:lineRule="exact"/>';
  if (xml.includes(OLD_SPACING)) {
    const pStart = xml.lastIndexOf('<w:p ', xml.indexOf(OLD_SPACING));
    const pEnd   = xml.indexOf('</w:p>', xml.indexOf(OLD_SPACING)) + '</w:p>'.length;
    let para = xml.slice(pStart, pEnd);

    para = para.replaceAll('<w:sz w:val="18"/>', '<w:sz w:val="19"/>');
    para = para.replaceAll('<w:szCs w:val="18"/>', '<w:szCs w:val="19"/>');

    xml = xml.slice(0, pStart) + para + xml.slice(pEnd);
    console.log('✅ P3 (Numero richiesta): sz 18→19');
  } else {
    console.warn('⚠️  P3 spacing non trovata');
  }
}

zip.file('word/document.xml', xml);
const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(OUTPUT, out);

console.log(`\n📄 Template aggiornato: ${patchCount} nuovi placeholder aggiunti.`);
console.log('📋 Placeholder attuali nel template:');
const phs = [...new Set(xml.match(/\{\{[^}]+\}\}/g) || [])].sort();
phs.forEach(p => console.log('  ' + p));
