// PURA: discrimina i "task-via" (voci di pianificazione a sola via) dall'attività.
export const ATTIVITA_TASK_VIA = 'BONIFICHE EXTRA';

export function isTaskVia(voce: { attivita?: string | null } | null | undefined): boolean {
  return (voce?.attivita ?? '').trim().toUpperCase() === ATTIVITA_TASK_VIA;
}

/**
 * PURA: una specifica voce si comporta da "task-via" (contenitore a sola via — apre TaskViaFocus,
 * esclusa da completezza/invio e dal corpo del PDF) in base alla modalità del template?
 *
 * - `tutto` (template task-via puro): ogni voce è un contenitore.
 * - `ibrido` (template ibrido): solo le voci BONIFICHE EXTRA sono contenitori; le altre restano
 *   classiche (con il loro esito). Permette di mischiare attività classiche e bonifiche nello
 *   stesso rapportino.
 * - nessuna delle due: nessuna voce è task-via (template normale, comportamento storico).
 */
export function voceTaskVia(
  voce: { attivita?: string | null } | null | undefined,
  modalita: { tutto?: boolean; ibrido?: boolean },
): boolean {
  if (modalita.tutto) return true;
  if (modalita.ibrido) return isTaskVia(voce);
  return false;
}
