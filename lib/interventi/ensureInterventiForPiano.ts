// Garantisce che gli interventi del piano esistano e siano allineati ai task correnti.
// Riceve il client Supabase per dependency injection: NON importa staticamente server-only/
// supabaseAdmin, così è riusabile sia dalle route API sia dallo script di backfill (tsx).
// (L'arricchimento tassonomia sotto è un'eccezione best-effort: import DINAMICO, dentro try/
// catch — se fallisce, es. nello script tsx, degrada a comportamento storico senza rompere il giro.)
import type { SupabaseClient } from '@supabase/supabase-js';
import { planInterventi, type OperatorePiano, type InterventoEsistente } from './planInterventiForPiano';
import { reapplyOverridesInterventi } from './territorioOverride';
import { caricaOdlGiaPositivi } from './caricaOdlPositivi';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

export type EnsureResult = {
  creati: number;
  preservati: number;
  scartati: number;
  /** odl dei task NON pianificati perché già eseguiti positivi altrove. */
  odlBloccati?: string[];
  /** set normalizzato degli odl con positivo altrove (riusato da sincronizzaRapportini per le voci). */
  odlGiaPositivi?: Set<string>;
  error?: string;
};

// Import dinamico (non statico): `caricaTassonomia` porta `import 'server-only'`, che il bundler
// di Next risolve ma che NON esiste come pacchetto reale — un import statico romperebbe
// l'esecuzione di questo file fuori da Next (lo script di backfill via tsx). L'import dinamico
// posticipa la resoluzione al momento della chiamata, dentro il try/catch: se fallisce (script
// tsx, o errore DB) la derivazione tassonomia è best-effort e la pianificazione NON si blocca.
async function caricaIndiceTassonomiaSafe(): Promise<Map<string, TassonomiaRiga> | undefined> {
  try {
    const { caricaTassonomia } = await import('@/lib/attivita/caricaTassonomia');
    const righe = await caricaTassonomia();
    return buildTassonomiaIndex(righe);
  } catch {
    return undefined;
  }
}

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
  // che è globale: (committente, odl, data) — la chiave qui è `committente|odl`, perché
  // dal 2026-07-21 i task derivano il committente VERO dalla tassonomia e un piano può
  // produrre interventi di committenti diversi). Include sia gli altri piani sia gli import
  // standalone con piano_id NULL (es. /api/interventi/import) — `neq` da solo li escluderebbe
  // perché in SQL `piano_id <> x` è NULL per le righe con piano_id NULL.
  const { data: altri } = await db
    .from('interventi')
    .select('odl, committente')
    .eq('data', piano.data)
    .or(`piano_id.is.null,piano_id.neq.${pianoId}`)
    .not('odl', 'is', null);
  const odlGiaPresenti = new Set(
    ((altri ?? []) as Array<{ odl: string | null; committente: string | null }>)
      .filter((r) => !!r.odl)
      .map((r) => `${r.committente}|${r.odl}`),
  );

  const indiceTassonomia = await caricaIndiceTassonomiaSafe();

  // ODL del piano con positivo ALTROVE (interventi o voce SI di altro piano): un ODL
  // positivo è definitivamente chiuso, non va mai ripianificato (lib/interventi/odlPositivi.ts).
  const odlTasks = operatori.flatMap((o) => (o.tasks ?? []).map((t) => t.odl ?? ''));
  const odlGiaPositivi = await caricaOdlGiaPositivi(db, odlTasks, { escludiPianoId: pianoId });

  const { idDaEliminare, daInserire, odlBloccati } = planInterventi({
    piano, pianoId, operatori, esistenti, territorioId, odlGiaPresenti, odlGiaPositivi, indiceTassonomia,
  });

  const preservati = esistenti.length - idDaEliminare.length;
  const totTask = operatori.reduce((s, o) => s + (o.tasks ?? []).length, 0);
  const scartati = totTask - daInserire.length;

  if (idDaEliminare.length) {
    const { error } = await db.from('interventi').delete().in('id', idDaEliminare);
    if (error) return { creati: 0, preservati, scartati, odlBloccati, odlGiaPositivi, error: error.message };
  }
  if (daInserire.length) {
    const { error } = await db.from('interventi').insert(daInserire);
    if (error) return { creati: 0, preservati, scartati, odlBloccati, odlGiaPositivi, error: error.message };
  }

  // Ri-applica gli override per-operatore: la rigenerazione ha appena rimesso il
  // territorio del piano su tutte le righe; per gli operatori spostati va ripristinato.
  await reapplyOverridesInterventi(db, pianoId);

  return { creati: daInserire.length, preservati, scartati, odlBloccati, odlGiaPositivi };
}
