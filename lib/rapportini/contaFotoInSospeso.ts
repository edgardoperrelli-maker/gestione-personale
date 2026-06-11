// lib/rapportini/contaFotoInSospeso.ts
// Conteggio delle foto ancora in sospeso (segnaposto `blob-locale:`) per rapportino,
// con la stessa paginazione anti-1000 di contaVoci.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { contaFotoInSospeso } from '@/utils/rapportini/fotoInSospeso';

const PAGE = 1000;

/** rapportino_id → numero di foto in sospeso (0 omesso). Non interroga il db se `rapIds` è vuoto. */
export async function contaFotoInSospesoByRapportino(
  db: SupabaseClient,
  rapIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (rapIds.length === 0) return counts;

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('rapportino_voci')
      .select('rapportino_id, risposte')
      .in('rapportino_id', rapIds)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as Array<{ rapportino_id: string; risposte: Record<string, unknown> | null }>;
    for (const v of batch) {
      const n = contaFotoInSospeso(v.risposte);
      if (n > 0) counts[v.rapportino_id] = (counts[v.rapportino_id] ?? 0) + n;
    }
    if (batch.length < PAGE) break;
  }

  return counts;
}
