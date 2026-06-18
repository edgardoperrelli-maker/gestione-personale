// lib/interventi/spostaData.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';
import { territorioEffettivo } from '@/utils/rapportini/territorioEffettivo';

export type SpostamentoDataResult =
  | { ok: true }
  | { ok: false; status: number; error?: string; conflicts?: Conflitto[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sposta un singolo rapportino su un altro giorno: aggiorna data + expires_at del rapportino
 *  E la data degli interventi dell'operatore (piano_id + staff_id), così l'agente lim-sync li
 *  legge sul giorno nuovo. Blocca se crea un duplicato dello stesso operatore su
 *  (territorio effettivo, nuovaData). */
export async function applicaSpostamentoDataRapportino(
  db: SupabaseClient,
  rapportinoId: string,
  nuovaData: string,
): Promise<SpostamentoDataResult> {
  if (!ISO_DATE.test(nuovaData)) return { ok: false, status: 400, error: 'Data non valida.' };

  const { data: rap } = await db
    .from('rapportini')
    .select('id, piano_id, staff_id, staff_name, data, territorio_override')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (!rap) return { ok: false, status: 404, error: 'Rapportino non trovato.' };
  const r = rap as {
    id: string; piano_id: string; staff_id: string; staff_name: string | null;
    data: string; territorio_override: string | null;
  };
  // NB: NON usciamo se r.data === nuovaData. Il rapportino potrebbe essere già sul giorno giusto
  // ma con gli interventi rimasti indietro (es. spostamento fatto da una versione vecchia che
  // muoveva solo il rapportino): ri-eseguire riallinea comunque gli interventi (self-heal).

  const { data: piano } = await db.from('mappa_piani').select('territorio').eq('id', r.piano_id).maybeSingle();
  const territorio = territorioEffettivo(r.territorio_override, (piano as { territorio: string | null } | null)?.territorio ?? null);

  // Conflitto: stesso operatore già su (territorio, nuovaData) in un altro piano.
  const { data: altri } = await db
    .from('rapportini')
    .select('id, staff_id, piano_id, data, stato, submitted_at, territorio_override')
    .eq('data', nuovaData)
    .eq('staff_id', r.staff_id)
    .neq('piano_id', r.piano_id);
  const altriPianoIds = [...new Set(((altri ?? []) as Array<{ piano_id: string }>).map((a) => a.piano_id))];
  const terrByPiano: Record<string, string | null> = {};
  if (altriPianoIds.length) {
    const { data: piani } = await db.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
    (piani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
  }
  const esistenti: RapEsistente[] = ((altri ?? []) as Array<{
    id: string; staff_id: string; piano_id: string; data: string; stato: string; submitted_at: string | null; territorio_override: string | null;
  }>).map((a) => ({
    id: a.id, staff_id: a.staff_id, piano_id: a.piano_id, data: a.data, stato: a.stato, submitted_at: a.submitted_at,
    territorio: territorioEffettivo(a.territorio_override, terrByPiano[a.piano_id] ?? null),
  }));
  const conflicts = rilevaConflitti({
    pianoId: r.piano_id, territorio, data: nuovaData,
    operatori: [{ staff_id: r.staff_id, staff_name: r.staff_name }],
    esistenti,
  });
  if (conflicts.length > 0) return { ok: false, status: 409, conflicts };

  // Allinea al nuovo giorno ANCHE gli interventi dell'operatore (come fa lo spostamento per-piano):
  // scoped a (piano_id, staff_id) muove SOLO i suoi e TUTTI i suoi. Prima del rapportino: se
  // fallisce, il rapportino NON si muove e lo stato resta coerente; un re-run riallinea entrambi
  // (il self-heal copre entrambi i versi: rapportino-avanti/interventi-indietro e viceversa).
  // NB: NON aggiorna mappa_distribuzioni (conteggi cronoprogramma): per quelli usare lo spostamento per-piano.
  const { error: eInt } = await db
    .from('interventi')
    .update({ data: nuovaData })
    .eq('piano_id', r.piano_id)
    .eq('staff_id', r.staff_id);
  if (eInt) {
    // Collisione sull'indice dedup interventi_dedup_idx (committente, odl, data): esiste già un
    // intervento con lo stesso ODL sul giorno di destinazione → 409 con messaggio chiaro (non un
    // 500 opaco, che il client mostrerebbe come fallimento silenzioso).
    const code = (eInt as { code?: string }).code;
    const dedup = code === '23505' || /interventi_dedup_idx|duplicate key/i.test(eInt.message ?? '');
    return dedup
      ? { ok: false, status: 409, error: 'Spostamento bloccato: un intervento con lo stesso ODL esiste già sul giorno di destinazione. Risolvi il duplicato e riprova.' }
      : { ok: false, status: 500, error: eInt.message };
  }

  const { error } = await db
    .from('rapportini')
    .update({ data: nuovaData, expires_at: scadenzaIso(nuovaData) })
    .eq('id', rapportinoId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
