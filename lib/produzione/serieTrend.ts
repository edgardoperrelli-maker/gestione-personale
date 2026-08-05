// PURA: serie temporali per il grafico di trend della Produzione economica.
// Il SAL del loader NON è filtrato per range (consuntivato dell'intera commessa): le righe con
// data < from diventano OFFSET iniziale della cumulata, così l'ultimo punto del grafico coincide
// con la card "SAL". Aree impilate: salCum + scartoCum + senzaOrdineCum = prodCum (con clamp ≥ 0).

import type { Aggregato } from './aggregaProduzione';
import { lunediSettimana } from './settimana';

export interface PuntoTrend {
  data: string; // 'YYYY-MM-DD'
  salCum: number;
  /** max(0, prodCum − salCum − senzaOrdineCum): il «da richiedere ad ACEA» VERO — lavoro con un
   *  ordine dietro, non ancora esitato. La quota senza ordine ne è fuori (regola 2026-08-05):
   *  etichettarla «da richiedere» era proprio la lettura da credito che lo split ha eliminato. */
  scartoCum: number;
  /** Cumulata del prodotto senza ordine ACEA: nel grafico è un'area a sé, mai «da richiedere». */
  senzaOrdineCum: number;
  prodCum: number;
  prodGiorno: number; // produzione puntuale del giorno (per le barre del ritmo)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function serieTrend(
  prodPerGiorno: Aggregato[],
  salPerGiorno: Aggregato[],
  from: string,
  to: string,
  senzaOrdinePerGiorno: Aggregato[] = [],
): PuntoTrend[] {
  let prod0 = 0;
  let sal0 = 0;
  let senza0 = 0;
  const prodByDay = new Map<string, number>();
  const salByDay = new Map<string, number>();
  const senzaByDay = new Map<string, number>();
  for (const g of prodPerGiorno) {
    if (g.chiave < from) prod0 += g.valore;
    else if (g.chiave <= to) prodByDay.set(g.chiave, (prodByDay.get(g.chiave) ?? 0) + g.valore);
  }
  for (const g of salPerGiorno) {
    if (g.chiave < from) sal0 += g.valore;
    else if (g.chiave <= to) salByDay.set(g.chiave, (salByDay.get(g.chiave) ?? 0) + g.valore);
  }
  for (const g of senzaOrdinePerGiorno) {
    if (g.chiave < from) senza0 += g.valore;
    else if (g.chiave <= to) senzaByDay.set(g.chiave, (senzaByDay.get(g.chiave) ?? 0) + g.valore);
  }
  const giorni = Array.from(new Set([...prodByDay.keys(), ...salByDay.keys()])).sort();
  const out: PuntoTrend[] = [];
  let p = prod0;
  let s = sal0;
  let z = senza0;
  for (const d of giorni) {
    p = round2(p + (prodByDay.get(d) ?? 0));
    s = round2(s + (salByDay.get(d) ?? 0));
    z = round2(z + (senzaByDay.get(d) ?? 0));
    out.push({
      data: d,
      prodCum: p,
      salCum: s,
      senzaOrdineCum: z,
      scartoCum: round2(Math.max(0, p - s - z)),
      prodGiorno: prodByDay.get(d) ?? 0,
    });
  }
  return out;
}

/** Raggruppa un aggregato per-giorno in per-settimana (chiave = lunedì ISO). */
export function raggruppaPerSettimana(agg: Aggregato[]): Aggregato[] {
  const m = new Map<string, Aggregato>();
  for (const g of agg) {
    const k = lunediSettimana(g.chiave);
    let a = m.get(k);
    if (!a) {
      a = { chiave: k, label: k, conteggio: 0, valore: 0 };
      m.set(k, a);
    }
    a.conteggio += g.conteggio;
    a.valore = round2(a.valore + g.valore);
  }
  return [...m.values()].sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
}
