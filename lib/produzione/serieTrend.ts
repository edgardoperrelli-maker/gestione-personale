// PURA: serie temporali per il grafico di trend della Produzione economica.
// Il SAL del loader NON è filtrato per range (consuntivato dell'intera commessa): le righe con
// data < from diventano OFFSET iniziale della cumulata, così l'ultimo punto del grafico coincide
// con la card "SAL". Lo scarto è clampato a ≥ 0 (aree impilate: salCum + scartoCum = prodCum).

import type { Aggregato } from './aggregaProduzione';

export interface PuntoTrend {
  data: string; // 'YYYY-MM-DD'
  salCum: number;
  scartoCum: number; // max(0, prodCum − salCum)
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
): PuntoTrend[] {
  let prod0 = 0;
  let sal0 = 0;
  const prodByDay = new Map<string, number>();
  const salByDay = new Map<string, number>();
  for (const g of prodPerGiorno) {
    if (g.chiave < from) prod0 += g.valore;
    else if (g.chiave <= to) prodByDay.set(g.chiave, (prodByDay.get(g.chiave) ?? 0) + g.valore);
  }
  for (const g of salPerGiorno) {
    if (g.chiave < from) sal0 += g.valore;
    else if (g.chiave <= to) salByDay.set(g.chiave, (salByDay.get(g.chiave) ?? 0) + g.valore);
  }
  const giorni = Array.from(new Set([...prodByDay.keys(), ...salByDay.keys()])).sort();
  const out: PuntoTrend[] = [];
  let p = prod0;
  let s = sal0;
  for (const d of giorni) {
    p = round2(p + (prodByDay.get(d) ?? 0));
    s = round2(s + (salByDay.get(d) ?? 0));
    out.push({
      data: d,
      prodCum: p,
      salCum: s,
      scartoCum: round2(Math.max(0, p - s)),
      prodGiorno: prodByDay.get(d) ?? 0,
    });
  }
  return out;
}

/** Lunedì (ISO) della settimana di un giorno 'YYYY-MM-DD'. */
function lunediDi(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const g = (d.getUTCDay() + 6) % 7; // 0=lunedì
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

/** Raggruppa un aggregato per-giorno in per-settimana (chiave = lunedì ISO). */
export function raggruppaPerSettimana(agg: Aggregato[]): Aggregato[] {
  const m = new Map<string, Aggregato>();
  for (const g of agg) {
    const k = lunediDi(g.chiave);
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
