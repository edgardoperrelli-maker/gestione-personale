/** Normalizza un indirizzo in stringa canonica: lowercase, senza accenti/punteggiatura/spazi. */
export function normalizzaIndirizzo(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** True se due indirizzi coincidono dopo normalizzazione (uguali o uno contiene l'altro). */
export function stessoCivico(viaVoce: unknown, indirizzoRef: unknown): boolean {
  const a = normalizzaIndirizzo(viaVoce);
  const b = normalizzaIndirizzo(indirizzoRef);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
