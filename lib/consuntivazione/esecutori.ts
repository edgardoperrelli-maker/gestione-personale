import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Esecutore } from './types';

/**
 * Normalizza la squadra ricevuta dal client: tiene solo gli staff_id esistenti (fonte staff),
 * deduplica preservando l'ordine (il PRIMO è il primario, porta staff_id + valore economico) e
 * risolve i nomi AUTOREVOLMENTE dallo staff (mai fidarsi del nome inviato dal client).
 */
export async function risolviEsecutori(
  db: SupabaseClient,
  input: Array<{ staff_id?: unknown }> | undefined | null,
): Promise<Esecutore[]> {
  const ids: string[] = [];
  const visti = new Set<string>();
  for (const e of input ?? []) {
    const id = String((e as { staff_id?: unknown })?.staff_id ?? '').trim();
    if (!id || visti.has(id)) continue;
    visti.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return [];
  const { data } = await db.from('staff').select('id, display_name').in('id', ids);
  const nome = new Map<string, string>();
  for (const s of ((data ?? []) as Array<{ id: string; display_name: string | null }>)) {
    nome.set(s.id, (s.display_name ?? '').trim() || s.id);
  }
  // Preserva l'ordine di input; scarta gli id non presenti nello staff.
  return ids.filter((id) => nome.has(id)).map((id) => ({ staff_id: id, staff_name: nome.get(id) ?? id }));
}
