// tools/limitazioni-sync/tick-assegna.mjs
// Loop di test SOLO-ACEA: ticka l'app ogni N secondi e, se l'app chiede un'assegnazione
// (forza_acea_assegna → aceaAssegna), esegue il giro di assegnazione col driver e invia il report.
// NON esegue sync/stato (niente masterPath SharePoint richiesto) → sicuro su questa macchina di test.
// Richiede in config.json: endpointUrl + exportKey reali (come l'agente di produzione).
//
// Uso:  node tick-assegna.mjs [secondi]        (default 60)
import fs from 'node:fs';
import path from 'node:path';
import { tick, inviaReport, baseUrlDaEndpoint } from './lib/apiAgente.mjs';
import { eseguiGiroAceaAssegna } from './lib/acea/eseguiGiroAceaAssegna.mjs';

const intervallo = Math.max(15, Number(process.argv[2] || 60)) * 1000;
const cfg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'config.json'), 'utf8'));
if (!cfg.endpointUrl || cfg.endpointUrl.includes('<') || !cfg.exportKey || cfg.exportKey.includes('<')) {
  console.error('config.json: endpointUrl/exportKey mancanti o segnaposto. Copiali dal config del PC del lavoro.');
  process.exit(1);
}
const baseUrl = baseUrlDaEndpoint(cfg.endpointUrl);
const exportKey = cfg.exportKey;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ora = () => new Date().toLocaleTimeString('it-IT');

console.log(`[tick-assegna] avvio su ${baseUrl} — tick ogni ${intervallo / 1000}s (SOLO assegnazione ACEA). Ctrl+C per fermare.`);
for (;;) {
  try {
    const ris = await tick({ baseUrl, exportKey, files: [] });
    if (ris.aceaAssegna && ris.aceaAssegnaData) {
      const dryRun = ris.aceaAssegnaDry !== false;
      const now = new Date();
      const stamp = now.toISOString().slice(0, 10).replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '') + '-acea-assegna';
      console.log(`[${ora()}] ASSEGNAZIONE richiesta per ${ris.aceaAssegnaData} (${dryRun ? 'PROVA' : 'REALE'}) → eseguo…`);
      const report = await eseguiGiroAceaAssegna({ cfg, stamp, data: ris.aceaAssegnaData, dryRun, baseUrl, exportKey });
      try { await inviaReport({ baseUrl, exportKey, report }); } catch (e) { console.error(`[${ora()}] inviaReport fallito: ${e instanceof Error ? e.message : e}`); }
      const n = report.righe?.length ?? 0;
      console.log(`[${ora()}] fatto: ${dryRun ? 'simulate' : 'assegnate'}=${report.file?.[0]?.aggiornate ?? n} scartate=${report.scartati?.length ?? 0}${report.erroreGlobale ? ' ERR: ' + report.erroreGlobale : ''}`);
    } else {
      console.log(`[${ora()}] tick ok — nessuna assegnazione richiesta`);
    }
  } catch (e) {
    console.error(`[${ora()}] tick fallito: ${e instanceof Error ? e.message : e}`);
  }
  await sleep(intervallo);
}
