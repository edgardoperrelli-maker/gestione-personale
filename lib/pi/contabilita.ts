// PURA: calcoli di contabilità P.I. (anteprima UI). In DB `valore` è una colonna
// generata; queste funzioni servono per il totale live e l'anteprima riga.

/** Arrotonda a 2 decimali (half-up, allineato a round(numeric,2) di Postgres). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Valore di una riga = quantità × prezzo, arrotondato a 2 decimali. */
export function valoreRiga(quantita: number, prezzo: number): number {
  const q = Number.isFinite(quantita) ? quantita : 0;
  const p = Number.isFinite(prezzo) ? prezzo : 0;
  return round2(q * p);
}

/** Totale della contabilità = Σ valore delle righe. */
export function totaleContabilita(righe: Array<{ quantita: number; prezzo_snapshot: number }>): number {
  return round2(righe.reduce((s, r) => s + valoreRiga(r.quantita, r.prezzo_snapshot), 0));
}
