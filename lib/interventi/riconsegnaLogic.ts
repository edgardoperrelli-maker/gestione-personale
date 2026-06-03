// Logica pura riconsegna misuratori. La penale contrattuale è di €1.000 per ogni
// misuratore "mancante" (rimosso e scaricato in magazzino, ma non riconsegnato).

export const PENALE_MISURATORE = 1000;

export type StatoMisuratore = 'in_custodia' | 'in_riepilogo' | 'consegnato' | 'mancante';

type ConStato = { stato: string };

/** Penale totale = €1.000 × numero di misuratori mancanti. */
export function calcolaPenale(misuratori: ConStato[]): number {
  return misuratori.filter((m) => m.stato === 'mancante').length * PENALE_MISURATORE;
}

/** Riepilogo di una cesta: conteggi per stato + penale maturata. */
export function riepilogoCesta(misuratori: ConStato[]): {
  totale: number;
  consegnati: number;
  mancanti: number;
  daConsegnare: number;
  penale: number;
} {
  const consegnati = misuratori.filter((m) => m.stato === 'consegnato').length;
  const mancanti = misuratori.filter((m) => m.stato === 'mancante').length;
  const daConsegnare = misuratori.filter((m) => m.stato === 'in_custodia' || m.stato === 'in_riepilogo').length;
  return {
    totale: misuratori.length,
    consegnati,
    mancanti,
    daConsegnare,
    penale: mancanti * PENALE_MISURATORE,
  };
}
