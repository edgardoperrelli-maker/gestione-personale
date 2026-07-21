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

/**
 * PURA: la voce è un CONTENITORE task-via (via-only: apre TaskViaFocus, è esclusa da esito,
 * completezza/invio e corpo del PDF)?
 *
 * Un intervento "+" (`manuale = true`) è SEMPRE un intervento VERO, MAI un contenitore — anche
 * quando la sua attività è BONIFICHE EXTRA (il "+" sotto un task-via nasce proprio con
 * quell'attività) e anche nei template task-via puri. È la stessa regola già applicata in
 * `datiRiepilogoPdf` (scarta i contenitori con `isTaskVia(v) && v.manuale !== true`) e nelle route
 * foto (`voci-foto`, `foto-zip`): qui la centralizziamo così i chiamanti non possono più
 * dimenticare la guardia `manuale` (era il caso di RapportinoForm → i "+" BONIFICHE EXTRA
 * finivano trattati come contenitori e sparivano da lista/PDF).
 */
export function contenitoreTaskVia(
  voce: { attivita?: string | null; manuale?: boolean | null } | null | undefined,
  modalita: { tutto?: boolean; ibrido?: boolean },
): boolean {
  if (voce?.manuale) return false;
  return voceTaskVia(voce, modalita);
}
