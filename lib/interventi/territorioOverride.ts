// lib/interventi/territorioOverride.ts
// Override per-operatore del territorio. Funzioni pure (risoluzione/reapply) +
// orchestrazioni db (spostamento, reapply post-rigenerazione). L'I/O è iniettato
// via SupabaseClient così le funzioni db sono testabili con un fake.
import type { SupabaseClient } from '@supabase/supabase-js';

export type RisoluzioneTerritorio =
  | { ok: true; override: string | null; territorioId: string | null }
  | { ok: false; error: string };

/** Mappa nome→id territorio (chiave: name.trim().toLowerCase()). */
export type IdByName = Map<string, string>;

export function buildIdByName(territori: Array<{ id: string; name: string }>): IdByName {
  return new Map(territori.map((t) => [t.name.trim().toLowerCase(), t.id]));
}

/**
 * Decide override + territorio_id di destinazione.
 * - nome valorizzato → deve esistere in territori (altrimenti errore).
 * - vuoto/null → ripristino: override null, destinazione = territorio del piano
 *   (id se risolvibile, altrimenti null).
 */
export function risolviTerritorioDestinazione(
  richiesto: string | null | undefined,
  territorioPiano: string | null | undefined,
  idByName: IdByName,
): RisoluzioneTerritorio {
  const req = (richiesto ?? '').trim();
  if (req) {
    const id = idByName.get(req.toLowerCase());
    if (!id) return { ok: false, error: `Territorio "${req}" non trovato.` };
    return { ok: true, override: req, territorioId: id };
  }
  const piano = (territorioPiano ?? '').trim();
  const id = piano ? (idByName.get(piano.toLowerCase()) ?? null) : null;
  return { ok: true, override: null, territorioId: id };
}

export type OverrideUpdate = { staffId: string; territorioId: string };

/** Update da applicare a interventi per ri-allineare gli override (solo risolvibili). */
export function reapplyOverridesPlan(
  rapportini: Array<{ staff_id: string; territorio_override: string | null }>,
  idByName: IdByName,
): OverrideUpdate[] {
  const out: OverrideUpdate[] = [];
  for (const r of rapportini) {
    const name = (r.territorio_override ?? '').trim();
    if (!name) continue;
    const id = idByName.get(name.toLowerCase());
    if (id) out.push({ staffId: r.staff_id, territorioId: id });
  }
  return out;
}

export type SpostamentoResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Applica lo spostamento: aggiorna rapportini.territorio_override e
 * interventi.territorio_id (righe del piano per quell'operatore).
 */
export async function applicaSpostamentoTerritorio(
  db: SupabaseClient,
  rapportinoId: string,
  territorio: string | null | undefined,
): Promise<SpostamentoResult> {
  const { data: rap } = await db
    .from('rapportini').select('id, piano_id, staff_id').eq('id', rapportinoId).maybeSingle();
  if (!rap) return { ok: false, status: 404, error: 'Rapportino non trovato.' };
  const r = rap as { id: string; piano_id: string; staff_id: string };

  const { data: piano } = await db
    .from('mappa_piani').select('territorio').eq('id', r.piano_id).maybeSingle();
  const { data: terr } = await db.from('territories').select('id, name');
  const idByName = buildIdByName((terr ?? []) as Array<{ id: string; name: string }>);

  const ris = risolviTerritorioDestinazione(
    territorio, (piano as { territorio: string | null } | null)?.territorio, idByName,
  );
  if (!ris.ok) return { ok: false, status: 400, error: ris.error };

  const { error: eRap } = await db
    .from('rapportini').update({ territorio_override: ris.override }).eq('id', rapportinoId);
  if (eRap) return { ok: false, status: 500, error: eRap.message };

  const { error: eInt } = await db
    .from('interventi').update({ territorio_id: ris.territorioId })
    .eq('piano_id', r.piano_id).eq('staff_id', r.staff_id);
  if (eInt) return { ok: false, status: 500, error: eInt.message };

  return { ok: true };
}

/** Ri-applica a interventi gli override dei rapportini del piano (dopo rigenerazione). */
export async function reapplyOverridesInterventi(db: SupabaseClient, pianoId: string): Promise<void> {
  const { data: raps } = await db
    .from('rapportini').select('staff_id, territorio_override')
    .eq('piano_id', pianoId).not('territorio_override', 'is', null);
  const overrides = (raps ?? []) as Array<{ staff_id: string; territorio_override: string | null }>;
  if (!overrides.length) return;
  const { data: terr } = await db.from('territories').select('id, name');
  const idByName = buildIdByName((terr ?? []) as Array<{ id: string; name: string }>);
  for (const u of reapplyOverridesPlan(overrides, idByName)) {
    await db.from('interventi').update({ territorio_id: u.territorioId })
      .eq('piano_id', pianoId).eq('staff_id', u.staffId);
  }
}
