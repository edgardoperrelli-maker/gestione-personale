// lib/interventi/giorniDaRecuperare.ts
// Quali giornate hanno voci di rapportino ESITATE rimaste senza intervento — cioè un esito che
// non arriva da nessuna parte: lo storico mostra «ESEGUITO SI», l'intervento non esiste o resta
// `assegnato`, e il motore economico non conta niente.
//
// Il perimetro del recupero si SCOPRE, non si passa: un intervallo va indovinato e sbagliato, e
// il modulo Live — l'unico posto da cui si recuperava — vede solo [oggi−7, oggi], mentre le
// orfane si accumulano indietro (la più vecchia misurata il 17/08/2026 era del 04/06).

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tetto di giornate per passata: il recupero fa due scritture pesanti per giorno
 * (`ensureInterventiForPiano` + il catch-up degli esiti) e la rotta ha un tempo massimo.
 * Superato il tetto si risponde `troncato: true` e si rilancia — non si perde niente, perché
 * ogni passata è idempotente e riparte dalle giornate rimaste.
 */
export const MAX_GIORNI_RECUPERO = 40;

/** Una voce vale come «esitata»: ha una risposta `eseguito` non vuota. */
const ESITO_PRESENTE = 'eseguito';

/**
 * Le giornate con almeno una voce esitata e scollegata, dalla più VECCHIA.
 *
 * Dalla più vecchia di proposito: sono quelle fuori dalla finestra del Live, cioè le uniche che
 * nessun altro strumento può raggiungere. Se il tetto tronca, il prossimo giro riprende da lì.
 *
 * Le voci `rifiutato` non contano: per loro l'assenza di intervento è lo stato GIUSTO
 * (migration 20260810160000), e recuperarle rimetterebbe in piedi i collegamenti che quel
 * lavoro ha tolto.
 */
export async function giorniDaRecuperare(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from('rapportino_voci')
    .select('risposte, approvazione_stato, rapportini!inner(data)')
    .is('intervento_id', null);
  if (error) throw new Error(error.message);

  const giorni = new Set<string>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    if (String(r.approvazione_stato ?? '') === 'rifiutato') continue;
    const risposte = (r.risposte ?? {}) as Record<string, unknown>;
    if (String(risposte[ESITO_PRESENTE] ?? '').trim() === '') continue;
    // PostgREST rende l'embed come oggetto o array secondo la cardinalità dedotta.
    const rap = (Array.isArray(r.rapportini) ? r.rapportini[0] : r.rapportini) as { data?: string | null } | null;
    const g = String(rap?.data ?? '').trim();
    if (g !== '') giorni.add(g);
  }
  return [...giorni].sort().slice(0, MAX_GIORNI_RECUPERO);
}
