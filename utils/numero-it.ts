// PURA: formattazione numerica italiana, con il punto delle migliaia SEMPRE.
//
// `toLocaleString('it-IT')` non basta: l'italiano, in ICU, ha `minimumGroupingDigits = 2`, cioè
// raggruppa solo da cinque cifre in su. Così nella stessa fila di KPI convivevano «141.453,71 €»
// e «6115,73 €» — stessa funzione, stessa valuta, due grafie diverse, e la seconda si legge male
// proprio dove serve leggere in fretta. `useGrouping: 'always'` toglie quella regola.
//
// Tutto il progetto passa da qui (decisione utente 2026-08-06): una sola grafia per i numeri,
// scritta una volta sola. Le DATE restano `toLocaleString` con le loro opzioni: non c'entrano.

/** Opzioni comuni: il raggruppamento non è mai facoltativo. */
const GRUPPI = { useGrouping: 'always' } as const;

/** Numero: `3.366`, `1.142,11`. `decimali` fissa quante cifre mostrare (default: come arriva). */
export function numeroIt(n: number, decimali?: number): string {
  return n.toLocaleString('it-IT', {
    ...GRUPPI,
    ...(decimali == null ? {} : { minimumFractionDigits: decimali, maximumFractionDigits: decimali }),
  });
}

/** Importo in euro: `6.115,73 €`. `decimali` a 0 per gli arrotondati (`91 €`). */
export function euroIt(n: number, decimali = 2): string {
  return n.toLocaleString('it-IT', {
    ...GRUPPI,
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  });
}
