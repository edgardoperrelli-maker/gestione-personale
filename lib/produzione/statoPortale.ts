// PURA: normalizzazione dello stato ODL del portale ACEA ("Descrizione Stato Ordine").
// Token canonico in MAIUSCOLO senza accenti/spazi/punteggiatura (es. "Completato" → "COMPLETATO"),
// così da agganciare il SAL e l'audit su un valore stabile. Allineato ai rank stato dell'agente.

export function normalizzaStatoPortale(stato: string | null | undefined): string {
  return String(stato ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Vero se il portale ha consuntivato l'ordine (COMPLETATO = remunerabile nel SAL). */
export function isCompletato(stato: string | null | undefined): boolean {
  return normalizzaStatoPortale(stato) === 'COMPLETATO';
}
