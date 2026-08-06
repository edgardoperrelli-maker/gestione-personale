// PURA: giornate-uomo di commessa per operatore e per giorno. Regola business (design 2026-07-02):
// una giornata vale la FRAZIONE di interventi della commessa lavorati sul totale lavorato nel
// giorno (gli operatori "doppio territorio" lavorano a saturazione: la giornata intera gonfierebbe
// l'impegno). "Lavorato" = intervento con esito (positivo o negativo), non gli assegnati.
// Contano SOLO i giorni FERIALI (lun–ven): il sabato è un canale a parte (solo attivazioni,
// accantonato in `sabato`), la domenica non è lavorativa e si scarta del tutto.
//
// "Commessa" e non "ACEA": dal 2026-08 la pagina ha un filtro committente e questo modulo conta
// le giornate della vista scelta — ACEA, AcquaLatina o la somma. Chi decide cosa è in commessa è
// il chiamante (`load.ts`), qui arriva già deciso.

import type { Aggregato } from './aggregaProduzione';

export interface RigaLavoro {
  staffId: string;
  operatore: string;
  data: string; // 'YYYY-MM-DD'
  inCommessa: boolean; // lavorato su una commessa della vista (committente effettivo, alias inclusi)
}

export interface PersonaleOperatore {
  chiave: string; // staffId
  label: string; // display name
  giornate: number; // somma frazioni nei giorni FERIALI (2 decimali)
  interventiCommessa: number; // interventi della commessa lavorati nei giorni feriali
  valore: number; // € produzione TOTALE del periodo (riconciliabile con la card Produzione)
  valoreFeriale: number; // € produzione dei soli giorni feriali (numeratore della resa)
  resa: number | null; // €/giornata FERIALE (valoreFeriale/giornate; null se giornate=0)
}

export interface PersonaleGiorno {
  data: string;
  dedicate: number; // somma frazioni degli operatori con frazione ≥ SOGLIA_DEDICATO
  saturazione: number; // somma frazioni degli operatori con frazione < SOGLIA_DEDICATO
  operatori: number; // operatori con almeno 1 intervento ACEA nel giorno
}

export interface ProduzionePersonale {
  totaleGiornate: number; // GIORNATE-UOMO feriali (somma delle frazioni di tutti gli operatori)
  /**
   * GIORNI di calendario davvero lavorati: feriali con almeno un intervento in commessa.
   *
   * Non è `totaleGiornate` e non è la finestra del periodo. La card «Personale impiegato» leggeva
   * le giornate-uomo come se fossero giorni («4 op × 19 gg» = 76 uomo-giorno, quadruplo del vero)
   * e la resa divideva per lo stesso 19. Se il lavoro parte il 29/07 i giorni sono quelli in cui
   * si è lavorato — 6 — e la produzione media giornaliera è quella: totale / 6.
   */
  giorniLavorati: number;
  operatoriAttivi: number; // operatori con giornate feriali > 0
  valoreFeriale: number; // € produzione feriale complessiva (numeratore della resa KPI)
  sabato: { giornate: number; valore: number }; // canale attivazioni, mostrato a parte
  perOperatore: PersonaleOperatore[];
  perGiorno: PersonaleGiorno[]; // solo giorni feriali
}

/** Conta gli interventi in commessa e il totale lavorato di un (operatore, giorno). */
type Cella = { staffId: string; operatore: string; data: string; commessa: number; totale: number };

export const SOGLIA_DEDICATO = 0.8;

/** Giorno della settimana di 'YYYY-MM-DD' in UTC: 0=domenica … 6=sabato. */
export function giornoSettimana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function aggregaPersonale(
  righe: RigaLavoro[],
  euroPerOperatore: Aggregato[],
  euroFerialePerOperatore: Aggregato[],
  extra: { valoreFeriale: number; sabatoValore: number },
): ProduzionePersonale {
  // (staffId, giorno) → conteggi lavorati
  const celle = new Map<string, Cella>();
  for (const r of righe) {
    if (!r.staffId || !r.data) continue;
    const k = `${r.staffId}|${r.data}`;
    let c = celle.get(k);
    if (!c) {
      c = { staffId: r.staffId, operatore: r.operatore, data: r.data, commessa: 0, totale: 0 };
      celle.set(k, c);
    }
    c.totale += 1;
    if (r.inCommessa) c.commessa += 1;
  }

  const perOp = new Map<string, PersonaleOperatore>();
  const perG = new Map<string, PersonaleGiorno>();
  let sabatoGiornate = 0;
  for (const c of celle.values()) {
    if (c.commessa === 0) continue; // quel giorno l'operatore non ha toccato la commessa
    const gs = giornoSettimana(c.data);
    if (gs === 0) continue; // domenica: non lavorativa, scartata ovunque
    const frazione = c.commessa / c.totale;
    if (gs === 6) {
      sabatoGiornate += frazione; // sabato: canale a parte (attivazioni)
      continue;
    }
    let op = perOp.get(c.staffId);
    if (!op) {
      op = { chiave: c.staffId, label: c.operatore, giornate: 0, interventiCommessa: 0, valore: 0, valoreFeriale: 0, resa: null };
      perOp.set(c.staffId, op);
    }
    op.giornate += frazione;
    op.interventiCommessa += c.commessa;
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
  const euroFer = new Map(euroFerialePerOperatore.map((e) => [e.chiave, e.valore]));
  for (const op of perOp.values()) {
    op.giornate = round2(op.giornate);
    op.valore = euro.get(op.chiave) ?? 0;
    op.valoreFeriale = round2(euroFer.get(op.chiave) ?? 0);
    op.resa = op.giornate > 0 ? round2(op.valoreFeriale / op.giornate) : null;
  }
  const perOperatore = [...perOp.values()].sort((a, b) => b.valore - a.valore || b.giornate - a.giornate);
  const perGiorno = [...perG.values()]
    .map((g) => ({ ...g, dedicate: round2(g.dedicate), saturazione: round2(g.saturazione) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const totaleGiornate = round2(perOperatore.reduce((s, o) => s + o.giornate, 0));
  return {
    totaleGiornate,
    // `perGiorno` contiene un elemento per giorno feriale in cui la commessa è stata toccata:
    // è già, per costruzione, l'elenco dei giorni davvero lavorati.
    giorniLavorati: perGiorno.length,
    operatoriAttivi: perOperatore.length,
    valoreFeriale: round2(extra.valoreFeriale),
    sabato: { giornate: round2(sabatoGiornate), valore: round2(extra.sabatoValore) },
    perOperatore,
    perGiorno,
  };
}
