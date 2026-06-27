// tools/limitazioni-sync/lib/acea/eseguiGiroAceaAssegna.mjs
// Orchestrazione assegnazione su ACEA: lock → fetch lista dall'app → mappa nome → assegna (Playwright) → report.
import path from 'node:path';
import { acquisisci, rilascia } from './lock.mjs';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';
import { fetchAceaAssegnazioni } from '../apiAgente.mjs';
import { assegnaInterventi } from './assegnaInterventi.mjs';
import { loginEdEsporta } from './driver.mjs';
import { parseExport } from './parseExport.mjs';
import { costruisciMappaAssegnatari, preassegnatoGiusto } from './mappaAssegnatariExport.mjs';

function reportBase(extra) {
  return { tipo: 'acea-assegna', dryRun: false, lavori: 0, file: [{ aggiornate: 0 }], righe: [], scartati: [], ...extra };
}

export async function eseguiGiroAceaAssegna({
  cfg, stamp, data, dryRun = true, nowMs = Date.now(),
  baseUrl, exportKey,
  fetchLista = fetchAceaAssegnazioni, assegna = assegnaInterventi,
  scaricaExport = loginEdEsporta, leggiExport = parseExport,
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

    // PRE-FILTRO pre-assegnati: se è configurata la colonna operatore dell'export, scarica l'export
    // ACEA, leggi l'assegnatario corrente di ogni ODL e SALTA quelli già assegnati alla risorsa giusta
    // (risparmio tempo: niente lavoro del driver su quegli ODL). Fail-soft: a ogni errore (login/parse
    // falliti, colonna assente) si ricade nel comportamento odierno e si assegna tutto.
    let giaAssegnate = [];
    let daAssegnare = righe;
    if (acea.usaExportPreassegnati !== false && acea.export?.colonnaOperatore) {
      try {
        const fileExport = await scaricaExport(acea, { stamp });
        const { righe: righeExp, erroreColonne } = await leggiExport(fileExport, {
          foglio: acea.export?.foglio, colonnaOdl: acea.export.colonnaOdl, colonnaStato: acea.export.colonnaStato,
          colonnaOperatore: acea.export.colonnaOperatore, colonnaOperatoreNome: acea.export.colonnaOperatoreNome,
        });
        if (!erroreColonne) {
          const mappa = costruisciMappaAssegnatari(righeExp);
          giaAssegnate = righe.filter((r) => preassegnatoGiusto(r.odl, r.operatoreAcea, mappa, acea.operatori));
          const giaSet = new Set(giaAssegnate.map((r) => r.odl));
          daAssegnare = righe.filter((r) => !giaSet.has(r.odl));
        }
      } catch (e) {
        console.error(`[lim-sync] pre-filtro pre-assegnati saltato (fail-soft): ${e instanceof Error ? e.message : e}`);
      }
    }

    const { esiti } = daAssegnare.length ? await assegna(acea, daAssegnare, { stamp, dryRun }) : { esiti: [] };
    const esitoByOdl = new Map(esiti.map((e) => [e.odl, e]));
    for (const r of giaAssegnate) {
      esitoByOdl.set(r.odl, { odl: r.odl, esito: 'gia-assegnato', motivo: 'già assegnato alla risorsa corretta (export ACEA)' });
    }
    const righeReport = righe.map((r) => {
      const e = esitoByOdl.get(r.odl) ?? { esito: 'fallito', motivo: 'nessun esito dal driver' };
      return { odl: r.odl, matricola: r.matricola ?? '', comune: r.comune ?? '', staffId: r.staffId ?? '', operatoreAcea: r.operatoreAcea, interventoId: r.interventoId ?? null, esito: e.esito, motivo: e.motivo ?? null };
    });
    const aggiornate = righeReport.filter((r) => r.esito === 'assegnato' || r.esito === 'gia-assegnato').length;
    return reportBase({ dryRun, data, lavori: righe.length, file: [{ aggiornate }], righe: righeReport, scartati });
  } catch (e) {
    return reportBase({ dryRun, data, erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
