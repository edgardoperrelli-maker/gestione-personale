// tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs
// Orchestrazione assegnazione su ACEA: lock → fetch lista dall'app → mappa nome → assegna (Playwright) → report.
import path from 'node:path';
import { acquisisci, rilascia } from './lock.mjs';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';
import { fetchAceaAssegnazioni } from '../apiAgente.mjs';
import { assegnaInterventi } from './assegnaInterventi.mjs';

function reportBase(extra) {
  return { tipo: 'acea-assegna', dryRun: false, lavori: 0, file: [{ aggiornate: 0 }], righe: [], scartati: [], ...extra };
}

export async function eseguiGiroAceaAssegna({
  cfg, stamp, data, dryRun = true, nowMs = Date.now(),
  baseUrl, exportKey,
  fetchLista = fetchAceaAssegnazioni, assegna = assegnaInterventi,
}) {
  const acea = cfg.acea;
  const lockPath = path.join(path.dirname(acea.masterPath), 'acea.lock');
  if (!acquisisci(lockPath, { nowMs })) {
    return reportBase({ saltato: true, erroreGlobale: 'Giro ACEA già in corso (lock).', data });
  }
  try {
    const lista = await fetchLista({ baseUrl, exportKey, data });
    const righeIn = Array.isArray(lista?.righe) ? lista.righe : [];
    const scartati = Array.isArray(lista?.scartati) ? lista.scartati : [];
    if (righeIn.length === 0) {
      return reportBase({ dryRun, data, scartati });
    }
    // mappa la grafia del nome operatore per il portale
    const righe = righeIn.map((r) => ({ ...r, operatoreAcea: risolviNomeOperatore(r.operatoreAcea, acea.operatori) }));
    const { esiti } = await assegna(acea, righe, { stamp, dryRun });
    const esitoByOdl = new Map(esiti.map((e) => [e.odl, e]));
    const righeReport = righe.map((r) => {
      const e = esitoByOdl.get(r.odl) ?? { esito: 'fallito', motivo: 'nessun esito dal driver' };
      return { odl: r.odl, matricola: r.matricola ?? '', comune: r.comune ?? '', staffId: r.staffId ?? '', operatoreAcea: r.operatoreAcea, interventoId: r.interventoId ?? null, esito: e.esito, motivo: e.motivo ?? null };
    });
    const aggiornate = righeReport.filter((r) => r.esito === 'assegnato').length;
    return reportBase({ dryRun, data, lavori: righe.length, file: [{ aggiornate }], righe: righeReport, scartati });
  } catch (e) {
    return reportBase({ dryRun, data, erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
