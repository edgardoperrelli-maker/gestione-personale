// tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs
// Orchestrazione: lock → driver(export) → parse → aggiorna master → backup/salva → report.
import path from 'node:path';
import { caricaWorkbook, backupFile, salva } from '../excelIO.mjs';
import { parseExport } from './parseExport.mjs';
import { aggiornaStato } from './aggiornaStato.mjs';
import { acquisisci, rilascia } from './lock.mjs';
import { loginEdEsporta } from './driver.mjs';

function reportBase(extra) {
  return { tipo: 'acea-stato', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], ...extra };
}

export async function eseguiGiroAcea({ cfg, stamp, driver = loginEdEsporta, nowMs = Date.now() }) {
  const a = cfg.acea;
  const lockPath = path.join(path.dirname(a.masterPath), 'acea.lock');
  if (!acquisisci(lockPath, { nowMs })) {
    return reportBase({ saltato: true, erroreGlobale: 'Giro ACEA già in corso (lock).' });
  }
  try {
    const fileExport = await driver(a, { stamp });
    const { righe, erroreColonne } = await parseExport(fileExport, {
      foglio: a.export?.foglio, colonnaOdl: a.export.colonnaOdl, colonnaStato: a.export.colonnaStato,
    });
    if (erroreColonne) {
      return reportBase({ erroreGlobale: `Export: colonne "${a.export.colonnaOdl}"/"${a.export.colonnaStato}" non trovate.` });
    }

    const wb = await caricaWorkbook(a.masterPath);
    const ws = (a.foglio && wb.getWorksheet(a.foglio)) || wb.worksheets[0];
    const rep = aggiornaStato(ws, righe, { masterColonnaOdl: a.masterColonnaOdl, masterColonnaStato: a.masterColonnaStato });
    if (rep.erroreColonne) {
      return reportBase({ lavori: righe.length, erroreGlobale: `Master: colonne "${a.masterColonnaOdl}"/"${a.masterColonnaStato}" non trovate.` });
    }

    if (rep.aggiornate > 0) { backupFile(a.masterPath, stamp); await salva(wb, a.masterPath); }

    return reportBase({
      lavori: righe.length,
      file: [{
        file: path.basename(a.masterPath), master: true, aggiornate: rep.aggiornate,
        extraAggiunte: 0, conflitti: [], colonneAssenti: [], righe: rep.righe, saltato: false, errore: null,
      }],
      extraNonCollocate: rep.nonAgganciate.map((odl) => ({ odl })),
      invariate: rep.invariate,
    });
  } catch (e) {
    return reportBase({ erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
