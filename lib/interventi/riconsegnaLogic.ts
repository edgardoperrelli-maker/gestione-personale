// Controllo dello scarico in magazzino dei misuratori rimossi.
// A fine giornata il magazziniere verifica che TUTTI i misuratori rimossi dagli
// operatori siano stati consegnati. Strumento operativo interno: nessuna penale.

export type StatoMisuratore = 'in_custodia' | 'in_riepilogo' | 'consegnato' | 'mancante';

type ConStato = { stato: string };

/** Conteggi del controllo scarico: consegnati / mancanti / ancora da controllare. */
export function riepilogoScarico(misuratori: ConStato[]): {
  totale: number;
  consegnati: number;
  mancanti: number;
  daControllare: number;
} {
  const consegnati = misuratori.filter((m) => m.stato === 'consegnato').length;
  const mancanti = misuratori.filter((m) => m.stato === 'mancante').length;
  const daControllare = misuratori.filter((m) => m.stato === 'in_custodia' || m.stato === 'in_riepilogo').length;
  return { totale: misuratori.length, consegnati, mancanti, daControllare };
}

/** True se la lista non è vuota e ogni misuratore risulta consegnato. */
export function tuttiConsegnati(misuratori: ConStato[]): boolean {
  return misuratori.length > 0 && misuratori.every((m) => m.stato === 'consegnato');
}
