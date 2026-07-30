// PURA: cosa è cambiato fra quello che il tablet sa e quello che dice il server, sulle
// richieste di assegnazione in sospeso.
//
// L'operatore AcquaLatina può mandare PIÙ richieste di fila — scansiona tre contatori dello
// stesso stabile e le chiede tutte insieme, così in ufficio arrivano in blocco. Poi resta
// fermo ad aspettare. Questa funzione decide quando dirgli «puoi andare» e su quali.
//
// Il confronto è contro l'insieme delle voci GIÀ NOTE come decise, non contro lo stato
// iniziale della pagina: una richiesta creata dopo il caricamento non esisteva a schermo, e
// confrontandola con l'inizio non verrebbe mai annunciata. Regge anche il caso stretto di una
// voce nata e approvata fra due giri di controllo.

export type VoceStato = { id: string; approvazione_stato?: string | null };

/** Voci ancora sospese: finché ce n'è almeno una, ha senso continuare a chiedere al server. */
export function inAttesa<T extends VoceStato>(voci: T[]): T[] {
  return (voci ?? []).filter((v) => v.approvazione_stato === 'in_attesa');
}

/** Id delle voci già decise (approvate o rifiutate): la base del confronto. */
export function idDecisi(voci: VoceStato[]): Set<string> {
  const s = new Set<string>();
  for (const v of voci ?? []) {
    if (v.approvazione_stato === 'approvato' || v.approvazione_stato === 'rifiutato') s.add(v.id);
  }
  return s;
}

export type Novita = {
  /** Voci passate ad approvato e non ancora annunciate: l'operatore può lavorarci. */
  assegnate: string[];
  /** Voci rifiutate e non ancora annunciate. */
  rifiutate: string[];
  /** Quante restano sospese lato server: è il numero da mostrare a chi aspetta. */
  ancoraInAttesa: number;
};

/**
 * Novità rispetto a `giaNoti` (gli id già decisi e già annunciati).
 *
 * Non «consuma» niente: chi chiama aggiorna `giaNoti` con quello che ha annunciato, così la
 * stessa notizia non si ripete a ogni giro.
 */
export function novitaAssegnazione(giaNoti: Set<string>, dalServer: VoceStato[]): Novita {
  const assegnate: string[] = [];
  const rifiutate: string[] = [];
  let ancoraInAttesa = 0;

  for (const v of dalServer ?? []) {
    if (v.approvazione_stato === 'in_attesa') { ancoraInAttesa++; continue; }
    if (giaNoti.has(v.id)) continue;
    if (v.approvazione_stato === 'approvato') assegnate.push(v.id);
    else if (v.approvazione_stato === 'rifiutato') rifiutate.push(v.id);
  }

  return { assegnate, rifiutate, ancoraInAttesa };
}

/** True se c'è qualcosa da dire all'operatore. */
export function haNovita(n: Novita): boolean {
  return n.assegnate.length > 0 || n.rifiutate.length > 0;
}
