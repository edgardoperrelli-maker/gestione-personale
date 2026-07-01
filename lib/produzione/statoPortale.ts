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

/**
 * Vero se lo scostamento è REMUNERATO da ACEA. ACEA paga solo gli ordini la cui causa di scostamento
 * inizia per "E" (es. EFRE/EIES/ECE2/EESM/EFRI/EMMR/ETAA per il dunning; EANC/EIEA/EIES per le massive).
 * Le causali non-E (NMNT/NPRT/NNCT…) sono scostamenti a nostro carico → non pagati, esclusi dal SAL.
 * Fallback: causale assente/vuota → true (transizione: finché l'agente non popola la colonna non
 * escludiamo nulla, così il SAL non crolla).
 */
export function scostamentoPagato(causa: string | null | undefined): boolean {
  const c = String(causa ?? '').trim().toUpperCase();
  if (!c) return true;
  return c.startsWith('E');
}
