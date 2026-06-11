// Garantisce che gli interventi del piano esistano e siano allineati ai task correnti.
// Riceve il client Supabase per dependency injection: NON importa server-only/supabaseAdmin,
// così è riusabile sia dalle route API sia dallo script di backfill (tsx).
import type { SupabaseClient } from '@supabase/supabase-js';
import { planInterventi, type OperatorePiano, type InterventoEsistente } from './planInterventiForPiano';
import { reapplyOverridesInterventi } from './territorioOverride';

export type EnsureResult = { creati: number; preservati: number; scartati: number; error?: string };

export async function ensureInterventiForPiano(db: SupabaseClient, pianoId: string): Promise<EnsureResult> {
  const { data: pianoRow } = await db
    .from('mappa_piani')
    .select('id, data, territorio')
    .eq('id', pianoId)
    .maybeSingle();
  const piano = pianoRow as { id: string; data: string; territorio: string | null } | null;
  if (!piano) return { creati: 0, preservati: 0, scartati: 0, error: 'Piano non trovato.' };

  // territorio del piano (nome) → territory_id, per il filtro torre
  let territorioId: string | null = null;
  if (piano.territorio) {
    const { data: terr } = await db.from('territories').select('id').eq('name', piano.territorio).maybeSingle();
    territorioId = (terr as { id: string } | null)?.id ?? null;
  }

  const { data: opRows } = await db
    .from('mappa_piani_operatori')
    .select('staff_id, tasks')
    .eq('piano_id', pianoId);
  const operatori = (opRows ?? []) as OperatorePiano[];

  const { data: existing } = await db
    .from('interventi')
    .select('id, odl, stato, matricola_contatore, indirizzo, intervento_tipo')
    .eq('piano_id', pianoId)
    .eq('created_from_mappa', true);
  const esistenti = (existing ?? []) as InterventoEsistente[];

  // odl già presenti su ALTRE righe della stessa data (rispetta interventi_dedup_idx,
  // che è globale: (committente, odl, data)). Include sia gli altri piani sia gli import
  // standalone con piano_id NULL (es. /api/interventi/import) — `neq` da solo li escluderebbe
  // perché in SQL `piano_id <> x` è NULL per le righe con piano_id NULL.
  const { data: altri } = await db
    .from('interventi')
    .select('odl')
    .eq('committente', 'acea')
    .eq('data', piano.data)
    .or(`piano_id.is.null,piano_id.neq.${pianoId}`)
    .not('odl', 'is', null);
  const odlGiaPresenti = new Set(
    ((altri ?? []) as Array<{ odl: string | null }>).map((r) => r.odl).filter((x): x is string => !!x),
  );

  const { idDaEliminare, daInserire } = planInterventi({
    piano, pianoId, operatori, esistenti, territorioId, odlGiaPresenti,
  });

  const preservati = esistenti.length - idDaEliminare.length;
  const totTask = operatori.reduce((s, o) => s + (o.tasks ?? []).length, 0);
  const scartati = totTask - daInserire.length;

  if (idDaEliminare.length) {
    const { error } = await db.from('interventi').delete().in('id', idDaEliminare);
    if (error) return { creati: 0, preservati, scartati, error: error.message };
  }
  if (daInserire.length) {
    const { error } = await db.from('interventi').insert(daInserire);
    if (error) return { creati: 0, preservati, scartati, error: error.message };
  }

  // Ri-applica gli override per-operatore: la rigenerazione ha appena rimesso il
  // territorio del piano su tutte le righe; per gli operatori spostati va ripristinato.
  await reapplyOverridesInterventi(db, pianoId);

  return { creati: daInserire.length, preservati, scartati };
}
