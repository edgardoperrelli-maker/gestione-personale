// utils/rapportini/opzioniEsito.ts
// Le tendine d'ESITO degli editor di CORREZIONE (modale Storico interventi, contenuto
// rapportino del Riepilogo) mostrano le opzioni dello snapshot storico della voce — che
// congela le azioni di quando il giro è partito. Un esito nato DOPO (es. «NESSUN PASSAGGIO»
// su AcquaLatina, 04/08/2026) non c'era negli snapshot dei giorni passati, e l'ufficio non
// poteva correggere un vecchio NO in «giro mai avvenuto» — la distinzione su cui la commessa
// decide se una riga di registro resta da lavorare (chiusuraRegistro).
//
// Qui si garantiscono i TRE esiti canonici — SI, NO, NESSUN PASSAGGIO — sulle sole select
// d'esito (Eseguito/Esito, `isEsitoSelect`): le opzioni storiche restano come sono (ordine e
// casing intatti), si aggiunge solo ciò che manca. I select secondari (es. «Sostituzione
// valvola») non si toccano: il loro «NO» è un attributo della lavorazione, non un esito.
//
// Vale SOLO per gli editor d'ufficio: il rapportino dell'operatore continua a mostrare le
// azioni del suo snapshot — è la correzione a posteriori ad avere bisogno di tutti gli esiti,
// non la compilazione sul campo.
import type { TemplateCampo } from './buildVoci';
import { isEsitoSelect } from './voceColore';

/**
 * Opzioni dell'esito coi tre canonici sempre selezionabili. Alcuni snapshot storici hanno il
 * solo positivo (la modale non permetteva di segnare «NO»), altri sono nati prima di
 * «NESSUN PASSAGGIO»: si preserva l'esistente e si aggiunge solo il mancante — «SI» in testa,
 * gli altri in coda — senza toccare il casing di ciò che c'è già.
 */
export function opzioniEsitoGarantite(opzioni: string[] | undefined): string[] {
  const base = (Array.isArray(opzioni) ? opzioni : []).filter((o) => typeof o === 'string' && o.trim() !== '');
  const presente = (t: string) => base.some((o) => o.trim().toUpperCase() === t);
  const out = base.slice();
  if (!presente('SI')) out.unshift('SI');
  if (!presente('NO')) out.push('NO');
  if (!presente('NESSUN PASSAGGIO')) out.push('NESSUN PASSAGGIO');
  return out;
}

/** I campi di un editor di correzione: select d'esito con i tre canonici garantiti, il resto intatto. */
export function campiConEsitoCorreggibile(campi: TemplateCampo[]): TemplateCampo[] {
  return campi.map((c) =>
    c.tipo === 'select' && isEsitoSelect(c) ? { ...c, opzioni: opzioniEsitoGarantite(c.opzioni) } : c,
  );
}
