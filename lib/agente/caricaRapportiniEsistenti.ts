// lib/agente/caricaRapportiniEsistenti.ts
// I/O sottile: carica i rapportini esistenti (forma RapEsistente attesa da rilevaConflitti)
// per una data, ristretti agli staffIds. Il territorio NON è su `rapportini`: si risolve
// via join su `mappa_piani` (stesso pattern di sincronizzaRapportini).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export async function caricaRapportiniEsistenti(
  db: SupabaseClient,
  data: string,
  staffIds: string[],
): Promise<RapEsistente[]> {
  if (staffIds.length === 0) return [];
  const { data: raps, error } = await db
    .from('rapportini')
    .select('id, staff_id, piano_id, data, stato, submitted_at')
    .eq('data', data)
    .in('staff_id', staffIds);
  if (error) throw new Error(error.message);
  const rows = (raps ?? []) as Array<{ id: string; staff_id: string; piano_id: string; data: string; stato: string; submitted_at: string | null }>;
  const pianoIds = [...new Set(rows.map((r) => r.piano_id))];
  const terrByPiano: Record<string, string | null> = {};
  if (pianoIds.length) {
    const { data: piani, error: ePiani } = await db.from('mappa_piani').select('id, territorio').in('id', pianoIds);
    if (ePiani) throw new Error(ePiani.message);
    for (const p of (piani ?? []) as Array<{ id: string; territorio: string | null }>) terrByPiano[p.id] = p.territorio ?? null;
  }
  return rows.map((r) => ({
    id: String(r.id),
    staff_id: String(r.staff_id),
    piano_id: String(r.piano_id),
    territorio: terrByPiano[r.piano_id] ?? null,
    data: String(r.data),
    stato: String(r.stato),
    submitted_at: r.submitted_at ?? null,
  }));
}
