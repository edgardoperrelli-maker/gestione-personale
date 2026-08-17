// lib/interventi/scritturaEsito.ts
// Il cancello davanti alla propagazione voce → intervento: legge com'è messo l'intervento e
// applica la regola pura di `decisioneScritturaEsito` (il positivo vince sempre).
//
// Vive qui e non dentro le route perché le strade che scrivono l'esito da una voce sono
// quattro (autosave dal campo, invio del rapportino, recupero d'ufficio, risincronizzazione) e
// una regola ripetuta quattro volte è una regola che prima o poi diverge.

import type { SupabaseClient } from '@supabase/supabase-js';
import { decisioneScritturaEsito, type DecisioneEsito } from '@/lib/interventi/esitoDaVoce';

/**
 * Se l'esito che arriva da una voce può essere scritto sull'intervento.
 *
 * Due letture piccole e indicizzate (`interventi` per id, `idx_voci_intervento` per il
 * conteggio) e solo quando servono davvero: un esito POSITIVO vince sempre, quindi non si paga
 * nessuna query per il caso normale — quello in cui l'operatore dichiara il lavoro fatto.
 *
 * In caso di errore di lettura si SCRIVE: il cancello serve a proteggere un positivo, non a
 * bloccare la chiusura di un intervento perché una select è andata storta. Un positivo perso è
 * grave, ma un rapportino che non chiude niente lo è di più — e la riconciliazione non ha modo
 * di accorgersene.
 */
export async function esitoScrivibile(
  db: SupabaseClient,
  interventoId: string,
  esitoNuovo: 'eseguito_positivo' | null,
): Promise<DecisioneEsito> {
  if (esitoNuovo === 'eseguito_positivo') return { scrivi: true };

  const { data, error } = await db
    .from('interventi').select('esito').eq('id', interventoId).maybeSingle();
  if (error) {
    console.error('[esito] stato intervento non letto, si scrive:', error.message);
    return { scrivi: true };
  }
  const esitoAttuale = (data as { esito: string | null } | null)?.esito ?? null;
  if (esitoAttuale !== 'eseguito_positivo') return { scrivi: true };

  const { count, error: eConta } = await db
    .from('rapportino_voci')
    .select('id', { count: 'exact', head: true })
    .eq('intervento_id', interventoId);
  if (eConta) {
    console.error('[esito] voci dell’intervento non contate, si scrive:', eConta.message);
    return { scrivi: true };
  }
  return decisioneScritturaEsito(esitoNuovo, esitoAttuale, count ?? 0);
}
