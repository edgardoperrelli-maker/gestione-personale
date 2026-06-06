/**
 * PURA: un admin può prendere in carico la richiesta se è libera, se è già sua
 * (idempotente), oppure se forza con override. Se è di un altro admin e niente
 * override → false (la route risponde 409 'gia_in_gestione').
 * @param presoDa  uuid dell'admin che la sta gestendo, o null se libera
 * @param userId   uuid dell'admin corrente
 * @param override true per riprendere una richiesta già in gestione da altri
 */
export function puoiPrendere(presoDa: string | null, userId: string, override: boolean): boolean {
  if (!presoDa) return true;
  if (presoDa === userId) return true;
  return override === true;
}
