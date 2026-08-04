// PURA: gli ODL segnalati TOP da ACEA, e l'ordine in cui vanno letti.
//
// Il flag vive sul registro (`acea_ordini.top`) e NON viene fotografato dentro la voce del
// rapportino: deve valere anche sugli ODL già in mano all'operatore, che è il caso per cui la
// funzione esiste — ACEA segnala un ordine urgente a giro già partito.

/** ODL confrontabile: il registro e le voci non sono sempre scritti con gli stessi spazi. */
export function normOdlTop(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Gli ODL marcati, da righe di registro.
 *
 * Regola dell'OR: la chiave del registro è `(odl, numero_operazione)` e lo stesso ODL può avere
 * più righe. Ne basta UNA marcata — altrimenti l'ufficio dovrebbe sapere quale operazione
 * scegliere, che è esattamente la domanda che questa funzione toglie di mezzo.
 */
export function odlTop(
  righe: readonly { odl: string | null; top?: boolean | null }[],
): Set<string> {
  const set = new Set<string>();
  for (const r of righe) {
    if (r.top !== true) continue;
    const k = normOdlTop(r.odl);
    if (k !== '') set.add(k);
  }
  return set;
}

/**
 * I TOP davanti, gli altri dietro, senza rimescolare né gli uni né gli altri.
 *
 * La stabilità è il punto: l'ordine di partenza è quello del giro, cioè quello geografico con cui
 * l'operatore si muove. Un sort che riordinasse dentro il gruppo gli farebbe fare chilometri in
 * più per obbedire a un badge.
 */
export function ordinaTopPrima<T extends { top?: boolean }>(righe: readonly T[]): T[] {
  return [...righe.filter((r) => r.top === true), ...righe.filter((r) => r.top !== true)];
}
