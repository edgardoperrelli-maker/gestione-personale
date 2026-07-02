// PURA: candele settimanali per operatore (design 2026-07-02). Corpo = CONTEGGIO (non €) di
// interventi ACEA assegnati quel giorno a quell'operatore, impilato in 3 segmenti reali
// (positivi/negativi/non lavorati) — NON normalizzato al 100% (a differenza di aggregaEsiti):
// l'altezza deve variare col volume reale del giorno. L'€ (dedup matricola, calcolato dal loader)
// resta solo nel tooltip, mai come segmento/etichetta sempre visibile.

export interface RigaCandela {
  staffId: string;
  operatore: string;
  data: string; // 'YYYY-MM-DD'
  esitoOk: boolean | null;
  valoreDedup: number; // € SOLO se la riga sopravvive al dedup matricola, 0 altrimenti
}

export interface CandelaGiorno {
  data: string;
  positivi: number;
  negativi: number;
  nonLavorati: number;
  assegnati: number;
  valore: number;
}

export interface CandelaOperatore {
  chiave: string; // staffId
  label: string; // display name
  giorni: CandelaGiorno[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** `settimana` = i 7 giorni ISO: garantisce sempre `settimana.length` CandelaGiorno per operatore,
 *  nello stesso ordine, anche nei giorni a zero (niente buchi nell'asse X). */
export function aggregaCandele(righe: RigaCandela[], settimana: string[]): CandelaOperatore[] {
  const indiceGiorno = new Map(settimana.map((data, i) => [data, i]));
  const m = new Map<string, CandelaOperatore>();
  for (const r of righe) {
    if (!r.staffId) continue;
    const idx = indiceGiorno.get(r.data);
    if (idx === undefined) continue; // data fuori dalla settimana richiesta
    let op = m.get(r.staffId);
    if (!op) {
      op = {
        chiave: r.staffId,
        label: r.operatore,
        giorni: settimana.map((data) => ({ data, positivi: 0, negativi: 0, nonLavorati: 0, assegnati: 0, valore: 0 })),
      };
      m.set(r.staffId, op);
    }
    const giorno = op.giorni[idx];
    giorno.assegnati += 1;
    if (r.esitoOk === true) giorno.positivi += 1;
    else if (r.esitoOk === false) giorno.negativi += 1;
    else giorno.nonLavorati += 1;
    giorno.valore += r.valoreDedup;
  }
  for (const op of m.values()) {
    for (const g of op.giorni) g.valore = round2(g.valore);
  }
  return [...m.values()].sort((a, b) => {
    const totA = a.giorni.reduce((s, g) => s + g.assegnati, 0);
    const totB = b.giorni.reduce((s, g) => s + g.assegnati, 0);
    return totB - totA;
  });
}
