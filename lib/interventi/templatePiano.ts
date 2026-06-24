// lib/interventi/templatePiano.ts
// Recupera il template "già stabilito" di un piano dai suoi rapportini esistenti, così il
// sync automatico al salvataggio può rigenerare le voci senza dipendere dallo stato del client.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Sceglie il template_id più rappresentato fra i rapportini di un piano (null se nessuno). Puro. */
export function pickTemplateId(rows: Array<{ template_id?: string | null }>): string | null {
  const conteggi = new Map<string, number>();
  for (const r of rows) {
    const t = r.template_id;
    if (!t) continue;
    conteggi.set(t, (conteggi.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [t, n] of conteggi) {
    if (n > bestN) { best = t; bestN = n; }
  }
  return best;
}

/** Recupera dal DB il template stabilito per il piano (dai rapportini esistenti). null se il piano non ne ha. */
export async function recuperaTemplateIdPiano(db: SupabaseClient, pianoId: string): Promise<string | null> {
  const { data } = await db.from('rapportini').select('template_id').eq('piano_id', pianoId);
  return pickTemplateId((data as Array<{ template_id?: string | null }>) ?? []);
}
