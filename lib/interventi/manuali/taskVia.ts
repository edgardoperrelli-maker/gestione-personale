// PURA: discrimina i "task-via" (voci di pianificazione a sola via) dall'attività.
export const ATTIVITA_TASK_VIA = 'BONIFICHE EXTRA';

export function isTaskVia(voce: { attivita?: string | null } | null | undefined): boolean {
  return (voce?.attivita ?? '').trim().toUpperCase() === ATTIVITA_TASK_VIA;
}

/**
 * PURA: una specifica voce si comporta da "task-via" (contenitore a sola via — apre TaskViaFocus,
 * esclusa da completezza/invio e dal corpo del PDF) in base alla modalità del template?
 *
 * Ordine di decisione:
 * 1. attività "BONIFICHE EXTRA" → contenitore SEMPRE, a prescindere dai flag del template —
 *    l'attività è di per sé il segnale. Così un template "ibrido nei fatti" (mischia attività
 *    classiche e BONIFICHE EXTRA nello stesso rapportino) apre il contenitore anche se non è
 *    stato spuntato `task_via_ibrido`.
 * 2. `tplTaskVia` (flag `task_via` del flusso DELLA voce, se la voce ne ha uno) → comanda lui.
 *    È la guardia contro il rapportino con testata task-via ma voci di un altro flusso: sul
 *    piano misto BONIFICHE EXTRA + Italgas la testata poteva uscire task-via per tutti, e ogni
 *    attività classica apriva il contenitore invece del form esito (PERUGIA, 2026-08-17).
 * 3. altrimenti vale la testata: `tutto` (template task-via puro) → contenitore. Copre le voci
 *    storiche senza flusso proprio (es. contenitori con attività vuota, giri di luglio 2026).
 *
 * `ibrido` resta nella firma per retro-compatibilità dei chiamanti (ridondante: il segnale è
 * l'attività). Il flag continua a esistere sul template per UI/PDF.
 */
export function voceTaskVia(
  voce: { attivita?: string | null; tplTaskVia?: boolean | null } | null | undefined,
  modalita: { tutto?: boolean; ibrido?: boolean },
): boolean {
  if (isTaskVia(voce)) return true;
  if (typeof voce?.tplTaskVia === 'boolean') return voce.tplTaskVia;
  return Boolean(modalita.tutto);
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
  voce: { attivita?: string | null; manuale?: boolean | null; tplTaskVia?: boolean | null } | null | undefined,
  modalita: { tutto?: boolean; ibrido?: boolean },
): boolean {
  if (voce?.manuale) return false;
  return voceTaskVia(voce, modalita);
}
