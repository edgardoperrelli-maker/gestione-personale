// Rileva se una chiusura "Fatto" (completato + esito positivo) duplica un altro intervento
// già completato positivo per lo stesso ODL. Non blocca l'operatore (chiude comunque): serve
// solo a marcare la riga per la riconciliazione del backoffice. Vedi lib/interventi/chiusuraOperatore.ts.
export type AltroCompletatoPositivo = { id: string; created_at: string };

/**
 * `altri` = altre righe stato=completato + esito=eseguito_positivo con lo stesso odl
 * (diverse dalla riga che si sta chiudendo). Se presenti, riferisce la più vecchia
 * (created_at minore): è quella "originale", le successive sono il doppione da riconciliare.
 */
export function rilevaDoppioPositivo(altri: AltroCompletatoPositivo[]): { rifId: string } | null {
  if (altri.length === 0) return null;
  const originale = altri.reduce((min, r) => (r.created_at < min.created_at ? r : min));
  return { rifId: originale.id };
}
