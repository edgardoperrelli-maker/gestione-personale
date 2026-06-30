// tools/limitazioni-sync/assegna-lista.mjs
// Esegue il driver di assegnazione su una LISTA di ODL letta da un file JSON.
// Default DRY-RUN (trova le righe, non salva). Per assegnare DAVVERO: aggiungi "reale".
// Serve a validare l'anti-cascata (sessioni fresche a blocchi + recovery) su un lotto reale.
//
// Uso:
//   node assegna-lista.mjs <file.json> [reale]
// File: [{ "odl": "957...", "operatoreAcea": "SIKORA" }, ...]
//   (operatoreAcea = cognome o nome; risolto con acea.operatori del config.json)
import fs from 'node:fs';
import path from 'node:path';
import { assegnaInterventi } from './lib/acea/assegnaInterventi.mjs';
import { risolviNomeOperatore } from './lib/acea/risolviNomeOperatore.mjs';

const [file, modo] = process.argv.slice(2);
if (!file) { console.error('Uso: node assegna-lista.mjs <file.json> [reale]'); process.exit(1); }
const dryRun = String(modo ?? '').trim().toLowerCase() !== 'reale';

const cfg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'config.json'), 'utf8'));
const acea = cfg.acea;

const src = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const righe = raw.map((x) => ({
  odl: String(x.odl).trim(),
  operatoreAcea: risolviNomeOperatore(x.operatoreAcea ?? x.cognome ?? '', acea.operatori),
}));

console.log(`${dryRun ? 'PROVA' : 'REALE'} su ${righe.length} ODL  (chunk=${acea?.assegna?.chunk ?? 20})`);
const t0 = Date.now();
const { esiti } = await assegnaInterventi(acea, righe, { stamp: 'lista', dryRun });
const secondi = Math.round((Date.now() - t0) / 1000);

const per = {};
for (const e of esiti) per[e.esito] = (per[e.esito] ?? 0) + 1;
console.log(`\nDURATA: ${secondi}s   RIEPILOGO: ${JSON.stringify(per)}`);

const problemi = esiti.filter((e) => e.esito !== 'simulato' && e.esito !== 'assegnato');
if (problemi.length) {
  console.log(`\nNON OK (${problemi.length}):`);
  for (const e of problemi) {
    const primaRiga = String(e.motivo ?? '').split('\n')[0].slice(0, 120);
    console.log(`  ${e.odl} [${e.esito}] ${primaRiga}`);
  }
}

const out = path.join(acea.debug || import.meta.dirname, 'esiti-lista.json');
try { fs.writeFileSync(out, JSON.stringify(esiti, null, 2)); console.log(`\nEsiti completi salvati in: ${out}`); } catch { /* best effort */ }
