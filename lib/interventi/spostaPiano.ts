// lib/interventi/spostaPiano.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';
import { territorioEffettivo } from '@/utils/rapportini/territorioEffettivo';
import { buildIdByName, risolviTerritorioDestinazione } from '@/lib/interventi/territorioOverride';

export type SpostamentoPianoResult =
  | { ok: true }
  | { ok: false; status: number; error?: string; conflicts?: Conflitto[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function applicaSpostamentoPiano(
  db: SupabaseClient,
  pianoId: string,
  opts: { data?: string; territorio?: string | null },
): Promise<SpostamentoPianoResult> {
  if (opts.data !== undefined && !ISO_DATE.test(opts.data)) return { ok: false, status: 400, error: 'Data non valida.' };
  if (opts.data === undefined && opts.territorio === undefined) {
    return { ok: false, status: 400, error: 'Specificare data e/o territorio.' };
  }

  const { data: piano } = await db.from('mappa_piani').select('id, data, territorio').eq('id', pianoId).maybeSingle();
  if (!piano) return { ok: false, status: 404, error: 'Piano non trovato.' };
  const p = piano as { id: string; data: string; territorio: string | null };

  const nuovaData = opts.data ?? p.data;
  const nuovoTerr = opts.territorio !== undefined ? opts.territorio : p.territorio;
  const cambiaData = nuovaData !== p.data;
  const cambiaTerr = (nuovoTerr ?? '') !== (p.territorio ?? '');
  if (!cambiaData && !cambiaTerr) return { ok: true };

  const { data: rapsRaw } = await db
    .from('rapportini')
    .select('id, staff_id, staff_name, stato, submitted_at, territorio_override')
    .eq('piano_id', pianoId);
  const raps = (rapsRaw ?? []) as Array<{
    id: string; staff_id: string; staff_name: string | null; stato: string; submitted_at: string | null; territorio_override: string | null;
  }>;

  // Conflitto: gli operatori del piano finirebbero su (nuovoTerr, nuovaData) dove esiste già un loro rapportino.
  const operatori = raps.map((r) => ({ staff_id: r.staff_id, staff_name: r.staff_name }));
  const { data: altriRaw } = await db
    .from('rapportini')
    .select('id, staff_id, piano_id, data, stato, submitted_at, territorio_override')
    .eq('data', nuovaData)
    .neq('piano_id', pianoId)
    .in('staff_id', operatori.map((o) => o.staff_id));
  const altri = (altriRaw ?? []) as Array<{
    id: string; staff_id: string; piano_id: string; data: string; stato: string; submitted_at: string | null; territorio_override: string | null;
  }>;
  const altriPianoIds = [...new Set(altri.map((a) => a.piano_id))];
  const terrByPiano: Record<string, string | null> = {};
  if (altriPianoIds.length) {
    const { data: piani } = await db.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
    (piani ?? []).forEach((x: { id: string; territorio: string | null }) => { terrByPiano[x.id] = x.territorio ?? null; });
  }
  const esistenti: RapEsistente[] = altri.map((a) => ({
    id: a.id, staff_id: a.staff_id, piano_id: a.piano_id, data: a.data, stato: a.stato, submitted_at: a.submitted_at,
    territorio: territorioEffettivo(a.territorio_override, terrByPiano[a.piano_id] ?? null),
  }));
  const conflicts = rilevaConflitti({ pianoId, territorio: nuovoTerr, data: nuovaData, operatori, esistenti });
  if (conflicts.length > 0) return { ok: false, status: 409, conflicts };

  // --- Scritture (nessuna transazione nativa in PostgREST: ordine prudente) ---
  const headerUpdate: Record<string, unknown> = {};
  if (cambiaData) headerUpdate.data = nuovaData;
  if (cambiaTerr) headerUpdate.territorio = nuovoTerr;
  const { error: eHead } = await db.from('mappa_piani').update(headerUpdate).eq('id', pianoId);
  if (eHead) return { ok: false, status: 500, error: eHead.message };

  if (cambiaData) {
    const expires = scadenzaIso(nuovaData);
    const { error: eRap } = await db.from('rapportini').update({ data: nuovaData, expires_at: expires }).eq('piano_id', pianoId);
    if (eRap) return { ok: false, status: 500, error: eRap.message };
    await db.from('interventi').update({ data: nuovaData }).eq('piano_id', pianoId);

    // Distribuzioni: azzera la vecchia data, upsert la nuova con i task_count del piano.
    const staffIds = operatori.map((o) => o.staff_id);
    if (staffIds.length) {
      await db.from('mappa_distribuzioni')
        .update({ task_count: 0, updated_at: new Date().toISOString() })
        .in('staff_id', staffIds).eq('data', p.data);
      const { data: opsRows } = await db.from('mappa_piani_operatori').select('staff_id, task_count').eq('piano_id', pianoId);
      const rows = ((opsRows ?? []) as Array<{ staff_id: string; task_count: number | null }>).map((o) => ({
        staff_id: o.staff_id, data: nuovaData, task_count: Number(o.task_count ?? 0), updated_at: new Date().toISOString(),
      }));
      if (rows.length) await db.from('mappa_distribuzioni').upsert(rows, { onConflict: 'staff_id,data' });
    }
  }

  if (cambiaTerr) {
    // Azzera gli override divergenti e riallinea interventi.territorio_id al nuovo territorio del piano.
    await db.from('rapportini').update({ territorio_override: null }).eq('piano_id', pianoId).not('territorio_override', 'is', null);
    const { data: terr } = await db.from('territories').select('id, name');
    const idByName = buildIdByName((terr ?? []) as Array<{ id: string; name: string }>);
    const ris = risolviTerritorioDestinazione(null, nuovoTerr, idByName);
    const territorioId = ris.ok ? ris.territorioId : null;
    await db.from('interventi').update({ territorio_id: territorioId }).eq('piano_id', pianoId);
  }

  return { ok: true };
}
