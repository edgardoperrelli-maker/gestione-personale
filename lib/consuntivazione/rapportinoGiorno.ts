// lib/consuntivazione/rapportinoGiorno.ts
// La Consuntivazione (backoffice) crea un intervento che non viene da nessun piano: finché
// l'operatore di quel giorno non ha ancora un rapportino, gliene serve uno contenitore, con
// piano_id nullo (invisibile alla pianificazione). Ma se l'operatore un rapportino per quel
// giorno ce l'ha già — tipicamente quello vero della sua pianificazione mappa/ACEA — la voce
// backoffice va LÌ, non in un secondo rapportino orfano: è la stessa regola «un rapportino per
// operatore per giorno» del motore ACEA (lib/acea/vociRapportino.ts), che qui mancava del tutto.
// Bug osservato il 05/08: LIBERATORI, TREGU e DE SANTIS avevano già il rapportino del giorno
// (piani ACEA/LAZIO CENTRO) e la Consuntivazione gliene ha aperto un secondo senza territorio,
// invisibile al riepilogo del loro rapportino vero.
import type { SupabaseClient } from '@supabase/supabase-js';
import { scegliRapportino } from '@/lib/acea/vociRapportino';

export type RapportinoGiorno = { id: string; stato: string };

/** Il rapportino che l'operatore ha già per quel giorno, su qualunque piano/territorio — o null
 *  se non ne ha ancora nessuno. Stessa precedenza di `scegliRapportino`: prima l'aperto. */
export async function trovaRapportinoOperatoreGiorno(
  db: SupabaseClient,
  staffId: string,
  data: string,
): Promise<RapportinoGiorno | null> {
  const { data: rows } = await db
    .from('rapportini')
    .select('id, stato, created_at')
    .eq('staff_id', staffId)
    .eq('data', data);
  const candidati = ((rows ?? []) as Array<{ id: string; stato: string; created_at: string | null }>)
    .map((r) => ({ id: r.id, stato: r.stato, created_at: r.created_at, conVociAcea: false }));
  const scelto = scegliRapportino(candidati);
  return scelto ? { id: scelto.id, stato: scelto.stato } : null;
}

/** Primo `ordine` libero per una nuova voce del rapportino: le voci backoffice si accodano,
 *  non si infilano davanti al lavoro che l'operatore ha già in corso. */
export async function prossimoOrdineVoce(db: SupabaseClient, rapportinoId: string): Promise<number> {
  const { data } = await db.from('rapportino_voci').select('ordine').eq('rapportino_id', rapportinoId);
  const max = ((data ?? []) as Array<{ ordine: number | null }>)
    .reduce((m, r) => Math.max(m, r.ordine ?? 0), 0);
  return max + 1;
}
