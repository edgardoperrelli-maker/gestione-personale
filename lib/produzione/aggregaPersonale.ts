// PURA: giornate-uomo ACEA per operatore e per giorno. Regola business (design 2026-07-02):
// una giornata vale la FRAZIONE di interventi ACEA lavorati sul totale lavorato nel giorno
// (gli operatori "doppio territorio" fanno ACEA a saturazione: la giornata intera gonfierebbe
// l'impegno). "Lavorato" = intervento con esito (positivo o negativo), non gli assegnati.

import type { Aggregato } from './aggregaProduzione';

export interface RigaLavoro {
  staffId: string;
  operatore: string;
  data: string; // 'YYYY-MM-DD'
  acea: boolean; // lavorato sulla commessa ACEA (committente effettivo, alias inclusi)
}

export interface PersonaleOperatore {
  chiave: string; // staffId
  label: string; // display name
  giornate: number; // somma frazioni (2 decimali)
  interventiAcea: number;
  valore: number; // € produzione (da euroPerOperatore)
  resa: number | null; // €/giornata (null se giornate=0)
}

export interface PersonaleGiorno {
  data: string;
  dedicate: number; // somma frazioni degli operatori con frazione ≥ SOGLIA_DEDICATO
  saturazione: number; // somma frazioni degli operatori con frazione < SOGLIA_DEDICATO
  operatori: number; // operatori con almeno 1 intervento ACEA nel giorno
}

export interface ProduzionePersonale {
  totaleGiornate: number;
  operatoriAttivi: number;
  perOperatore: PersonaleOperatore[];
  perGiorno: PersonaleGiorno[];
}

export const SOGLIA_DEDICATO = 0.8;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function aggregaPersonale(righe: RigaLavoro[], euroPerOperatore: Aggregato[]): ProduzionePersonale {
  // (staffId, giorno) → conteggi lavorati
  type Cella = { staffId: string; operatore: string; data: string; acea: number; totale: number };
  const celle = new Map<string, Cella>();
  for (const r of righe) {
    if (!r.staffId || !r.data) continue;
    const k = `${r.staffId}|${r.data}`;
    let c = celle.get(k);
    if (!c) {
      c = { staffId: r.staffId, operatore: r.operatore, data: r.data, acea: 0, totale: 0 };
      celle.set(k, c);
    }
    c.totale += 1;
    if (r.acea) c.acea += 1;
  }

  const perOp = new Map<string, PersonaleOperatore>();
  const perG = new Map<string, PersonaleGiorno>();
  for (const c of celle.values()) {
    if (c.acea === 0) continue; // quel giorno l'operatore non ha toccato ACEA
    const frazione = c.acea / c.totale;
    let op = perOp.get(c.staffId);
    if (!op) {
      op = { chiave: c.staffId, label: c.operatore, giornate: 0, interventiAcea: 0, valore: 0, resa: null };
      perOp.set(c.staffId, op);
    }
    op.giornate += frazione;
    op.interventiAcea += c.acea;
    let g = perG.get(c.data);
    if (!g) {
      g = { data: c.data, dedicate: 0, saturazione: 0, operatori: 0 };
      perG.set(c.data, g);
    }
    if (frazione >= SOGLIA_DEDICATO) g.dedicate += frazione;
    else g.saturazione += frazione;
    g.operatori += 1;
  }

  const euro = new Map(euroPerOperatore.map((e) => [e.chiave, e.valore]));
  for (const op of perOp.values()) {
    op.giornate = round2(op.giornate);
    op.valore = euro.get(op.chiave) ?? 0;
    op.resa = op.giornate > 0 ? round2(op.valore / op.giornate) : null;
  }
  const perOperatore = [...perOp.values()].sort((a, b) => b.valore - a.valore || b.giornate - a.giornate);
  const perGiorno = [...perG.values()]
    .map((g) => ({ ...g, dedicate: round2(g.dedicate), saturazione: round2(g.saturazione) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const totaleGiornate = round2(perOperatore.reduce((s, o) => s + o.giornate, 0));
  return { totaleGiornate, operatoriAttivi: perOperatore.length, perOperatore, perGiorno };
}
