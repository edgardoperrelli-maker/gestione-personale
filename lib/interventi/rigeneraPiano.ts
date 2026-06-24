// lib/interventi/rigeneraPiano.ts
// Orchestrazione del salvataggio di un piano: rigenera i record `interventi` (torre/agenda) E
// risincronizza le voci dei rapportini ESISTENTI del piano, così i nuovi ODL aggiunti in
// pianificazione compaiono subito nel rapportino dell'operatore (col badge "nuovo") e il
// collegamento voce↔intervento resta integro. Robusto: il template viene recuperato lato
// server dai rapportini del piano (niente dipendenza dallo stato del client) e un eventuale
// conflitto del sync NON fa fallire la creazione degli interventi (solo warning).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { sincronizzaRapportini } from '@/lib/interventi/sincronizzaRapportini';
import { recuperaTemplateIdPiano } from '@/lib/interventi/templatePiano';

export type RigeneraResult =
  | { ok: true; creati: number; preservati: number; scartati: number; rapportiniSync?: number; rapportiniWarning?: string }
  | { ok: false; status: number; error: string };

export async function rigeneraPiano(db: SupabaseClient, pianoId: string): Promise<RigeneraResult> {
  const ens = await ensureInterventiForPiano(db, pianoId);
  if (ens.error) {
    const status = ens.error === 'Piano non trovato.' ? 404 : 500;
    return { ok: false, status, error: ens.error };
  }
  const base = { ok: true as const, creati: ens.creati, preservati: ens.preservati, scartati: ens.scartati };

  // Solo i piani che hanno GIÀ dei rapportini hanno un template "stabilito": la prima
  // generazione (scelta del modello + conferma) resta competenza del flusso esplicito.
  const templateId = await recuperaTemplateIdPiano(db, pianoId);
  if (!templateId) return base;

  // skipInviati: un rapportino consegnato non va alterato senza conferma esplicita.
  const sync = await sincronizzaRapportini(db, pianoId, { templateId, skipInviati: true });
  if (sync.ok) return { ...base, rapportiniSync: sync.rapportini.length };
  return { ...base, rapportiniWarning: sync.error ?? `conflitto rapportini (${sync.status})` };
}
