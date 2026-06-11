// lib/rapportini/contaVoci.ts
// Conteggio delle voci per rapportino con paginazione: PostgREST tronca le query
// a `max-rows` (default 1000). Il riepilogo contava le voci con una sola query
// `.in('rapportino_id', rapIds)` non paginata → oltre la 1000ª voce i conteggi
// risultavano 0/parziali. Qui pagina finché un batch è < PAGE, come fa l'export.
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE = 1000;

/**
 * Ritorna una mappa rapportino_id → numero di voci, contando TUTTE le voci anche
 * oltre il limite di 1000 righe. Ordina per `id` (PK) per una paginazione stabile
 * (pagine non sovrapposte). Non interroga il db se `rapIds` è vuoto.
 */
export async function contaVociByRapportino(
  db: SupabaseClient,
  rapIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (rapIds.length === 0) return counts;

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('rapportino_voci')
      .select('rapportino_id')
      .in('rapportino_id', rapIds)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as Array<{ rapportino_id: string }>;
    for (const v of batch) {
      counts[v.rapportino_id] = (counts[v.rapportino_id] ?? 0) + 1;
    }
    if (batch.length < PAGE) break;
  }

  return counts;
}
