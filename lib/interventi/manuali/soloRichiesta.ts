// PURA: i committenti per cui il "+" è una RICHIESTA DI ASSEGNAZIONE, non un intervento eseguito.
//
// AcquaLatina: l'operatore è sul posto ma senza il task sul tablet non può iniziare. Manda la
// richiesta, l'ufficio assegna, e solo allora compila esito e foto sul task vero. Per questo la
// modale si ferma all'anagrafica — niente passo esito, niente passo foto — e quindi NON raccoglie
// nemmeno una foto.
//
// Vive qui, condiviso fra modale e route, perché su questo client e server DEVONO concordare.
// Se il server pretendesse le foto per un "+" che il client non ha mai chiesto, la richiesta
// verrebbe respinta con un 422 che dal telefono è impossibile da soddisfare, e resterebbe
// bloccata in coda per sempre: è esattamente il modo in cui si è persa una giornata di lavoro il
// 07/08/2026 (cfr. gateFotoManuale.test.ts). Finché la regola sta in un posto solo, le due metà
// non possono più separarsi.
//
// Da non confondere con `COMMITTENTI_ASSEGNAZIONE_MANUALE` (daAssegnare.ts): quello descrive cosa
// deve fare il BACKOFFICE dopo l'approvazione, questo la forma del flusso IN CAMPO. Oggi elencano
// lo stesso committente, ma rispondono a due domande diverse e possono divergere.
export const COMMITTENTI_SOLO_RICHIESTA: readonly string[] = ['acqualatina'];

/** True se per questo committente il "+" è solo una richiesta di assegnazione (niente esito/foto). */
export function isSoloRichiesta(committente: string | null | undefined): boolean {
  return COMMITTENTI_SOLO_RICHIESTA.includes(String(committente ?? ''));
}
