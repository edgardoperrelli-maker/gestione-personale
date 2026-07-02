// PURA: esiti per operatore sulla base ASSEGNATA (design 2026-07-02). Base = ogni riga di
// `interventi` con committente effettivo 'acea' e operatore, nel range: positivi (eseguito ok),
// negativi (lavorato ko), non lavorati (mai chiusi — il fenomeno "saturazione" da mostrare alla
// dirigenza). Conteggio per RIGA, nessuna dedup per matricola: è una vista di carico, non di fatturato.

import type { Aggregato } from './aggregaProduzione';

export interface RigaEsito {
  staffId: string;
  operatore: string;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=assegnato mai lavorato
}

export interface EsitoOperatore {
  chiave: string; // staffId
  label: string; // display name
  assegnati: number; // positivi + negativi + nonLavorati
  positivi: number;
  negativi: number;
  nonLavorati: number;
  valore: number; // € produzione TOTALE dell'operatore nel periodo (stesso numero del grafico €)
}

export function aggregaEsiti(righe: RigaEsito[], euroPerOperatore: Aggregato[]): EsitoOperatore[] {
  const m = new Map<string, EsitoOperatore>();
  for (const r of righe) {
    if (!r.staffId) continue;
    let e = m.get(r.staffId);
    if (!e) {
      e = { chiave: r.staffId, label: r.operatore, assegnati: 0, positivi: 0, negativi: 0, nonLavorati: 0, valore: 0 };
      m.set(r.staffId, e);
    }
    e.assegnati += 1;
    if (r.esitoOk === true) e.positivi += 1;
    else if (r.esitoOk === false) e.negativi += 1;
    else e.nonLavorati += 1;
  }
  const euro = new Map(euroPerOperatore.map((e) => [e.chiave, e.valore]));
  for (const e of m.values()) e.valore = euro.get(e.chiave) ?? 0;
  return [...m.values()].sort((a, b) => b.assegnati - a.assegnati || b.valore - a.valore);
}
