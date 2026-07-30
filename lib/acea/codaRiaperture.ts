// lib/acea/codaRiaperture.ts
// PURA: cosa mostra la scheda «Riaperture», e cosa conta il suo badge.
//
// La scheda è una CODA DI LAVORO, non un archivio: mostra le riaperture su cui c'è ancora
// qualcosa da fare. Prima mostrava tutte le righe con `riapertura=true` — comprese le 452 chiuse
// su ACEA e quelle già completate nei nostri rapportini — e le 14 che potevano ancora sfuggire
// stavano in mezzo a centinaia di righe archiviate. Le esitate hanno già una casa: la scheda
// «Chiusi» per quelle chiuse su ACEA, e il prossimo import ci porta anche quelle completate da
// noi, quando il Cruscotto le registra.
//
// Due domande, due funzioni, perché sono DIVERSE e la differenza è il punto:
//  - «è ancora da fare?» decide chi sta nella scheda: fuori le completate nei rapportini;
//  - «è in calendario?» decide il triangolo rosso sul tasto: conta le attivazioni che NESSUNO ha
//    messo su un giorno — quelle che scadono domani e possono sparire senza che nessuno le veda.

/** Il minimo di un intervento che serve a decidere: chi ce l'ha in mano, e a che punto è. */
export type InterventoDellOdl = {
  staff_id: string | null;
  stato: string | null;
};

/**
 * `true` se la riapertura è stata ESITATA nei nostri rapportini: un intervento completato.
 *
 * Gli annullati non contano — un intervento annullato è lavoro che non è mai successo — e nemmeno
 * gli assegnati: assegnata non vuol dire fatta, e la scheda serve proprio a chi controlla che le
 * assegnate del giorno arrivino in fondo.
 */
export function esitataNeiRapportini(interventi: readonly InterventoDellOdl[]): boolean {
  return interventi.some((i) => i.stato === 'completato');
}

/**
 * `true` se la riapertura è IN CALENDARIO: esiste un intervento vivo (non annullato).
 *
 * Un intervento vivo ha per costruzione una data (`interventi.data` è NOT NULL), quindi «ha un
 * intervento vivo» e «ha una data di pianificazione» sono la stessa domanda. L'appunto
 * (`pianificato_il_bozza`) NON conta, di proposito: finché la coppia non si completa l'intervento
 * non esiste, quindi non esiste il rapportino — e il triangolo esiste per contare il lavoro che
 * non arriverà a nessuno, che è esattamente la condizione della riga a metà.
 */
export function pianificata(interventi: readonly InterventoDellOdl[]): boolean {
  return interventi.some((i) => i.stato !== 'annullato');
}

/**
 * Le riaperture APERTE senza una data di pianificazione: il numero del triangolo rosso sul tasto.
 *
 * `odlAperti` sono gli ODL con `riapertura=true` e `aperto=true` (li filtra Postgres); l'indice
 * porta gli interventi di quegli ODL. Le esitate nei rapportini non si contano: non sono «senza
 * data», sono finite — contarle farebbe gridare il triangolo per lavoro già fatto.
 */
export function contaSenzaData(
  odlAperti: readonly string[],
  interventiPerOdl: ReadonlyMap<string, readonly InterventoDellOdl[]>,
): number {
  let n = 0;
  const visti = new Set<string>();
  for (const odl of odlAperti) {
    if (visti.has(odl)) continue;   // più operazioni sullo stesso ODL: un lavoro solo, si conta una volta
    visti.add(odl);
    const interventi = interventiPerOdl.get(odl) ?? [];
    if (esitataNeiRapportini(interventi)) continue;
    if (!pianificata(interventi)) n += 1;
  }
  return n;
}
