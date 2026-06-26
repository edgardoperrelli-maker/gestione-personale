// PURA: discrimina i "task-via" (voci di pianificazione a sola via) dall'attività.
export const ATTIVITA_TASK_VIA = 'BONIFICHE EXTRA';

export function isTaskVia(voce: { attivita?: string | null } | null | undefined): boolean {
  return (voce?.attivita ?? '').trim().toUpperCase() === ATTIVITA_TASK_VIA;
}

/**
 * PURA: una specifica voce si comporta da "task-via" (contenitore a sola via — apre TaskViaFocus,
 * esclusa da completezza/invio e dal corpo del PDF) in base alla modalità del template?
 *
 * - `tutto` (template task-via puro): OGNI voce è un contenitore, qualunque sia l'attività.
 * - altrimenti: lo è SOLO la voce con attività "BONIFICHE EXTRA". Vale a prescindere dal flag
 *   `ibrido` del template — l'attività "BONIFICHE EXTRA" è di per sé il segnale di contenitore.
 *   Così un template "ibrido nei fatti" (mischia attività classiche e BONIFICHE EXTRA nello stesso
 *   rapportino) apre il contenitore anche se non è stato spuntato `task_via_ibrido`, eliminando il
 *   footgun che lasciava quelle voci sul form esito classico. Le altre attività restano classiche.
 *
 * `ibrido` resta nella firma per retro-compatibilità dei chiamanti (ora ridondante: il segnale è
 * l'attività). Il flag continua a esistere sul template per UI/PDF.
 */
export function voceTaskVia(
  voce: { attivita?: string | null } | null | undefined,
  modalita: { tutto?: boolean; ibrido?: boolean },
): boolean {
  if (modalita.tutto) return true;
  return isTaskVia(voce);
}
