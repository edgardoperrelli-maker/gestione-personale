// tools/limitazioni-sync/assegna-odl.mjs
// Strumento manuale: assegna UN ODL preciso a UN operatore (per cognome) sul Cruscotto ACEA.
// NON legge il master: ODL e operatore arrivano da riga di comando → zero rischio di dati sbagliati.
// Riusa il driver testato (assegnaInterventi) e il config.json dell'agente per login/browser.
//
// Uso:
//   node assegna-odl.mjs <odl> <cognome> [reale]
// Esempi:
//   node assegna-odl.mjs 957311545 LIBERATORI          → DRY-RUN (trova la riga, non salva)
//   node assegna-odl.mjs 957311545 LIBERATORI reale    → REALE (assegna e salva)
import fs from 'node:fs';
import path from 'node:path';
import { assegnaInterventi } from './lib/acea/assegnaInterventi.mjs';
import { risolviNomeOperatore } from './lib/acea/risolviNomeOperatore.mjs';

const [odl, cognome, modo] = process.argv.slice(2);
if (!odl || !cognome) {
  console.error('Uso: node assegna-odl.mjs <odl> <cognome> [reale]');
  process.exit(1);
}
const dryRun = String(modo ?? '').trim().toLowerCase() !== 'reale';

const cfgPath = path.join(import.meta.dirname, 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const acea = cfg.acea;

const operatoreAcea = risolviNomeOperatore(cognome, acea.operatori);
const righe = [{ odl: String(odl).trim(), operatoreAcea }];

console.log(`${dryRun ? 'PROVA' : 'REALE'} su 1 ODL: ${righe[0].odl} -> ${operatoreAcea}`);

const { esiti } = await assegnaInterventi(acea, righe, { stamp: 'manual', dryRun });
console.log('ESITI:', JSON.stringify(esiti, null, 2));
