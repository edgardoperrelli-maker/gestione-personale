// lib/acqualatina/propagaAnagrafica.ts
// La correzione d'ufficio dell'anagrafica del punto (PDR/impianto, nominativo, indirizzo,
// comune, cap), fatta dal modulo Interventi, che converge sul registro AcquaLatina — lo stesso
// gesto che il sync dal master fa in senso opposto (registro → interventi), completato
// nell'altro verso. Prima esisteva solo come backfill una tantum (20260802140000, «l'anagrafica
// CONVERGE sul registro»); qui diventa continuo, un edit alla volta.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistroAnagraficaPatch } from '@/lib/interventi/storico/modifica';

/**
 * Propaga la correzione anagrafica dell'intervento fino al registro AcquaLatina agganciato.
 *
 * Best-effort e silenziosa se non c'è niente a cui propagare: un intervento non-acqualatina
 * (`ordine_id` può puntare ad `acea_ordini`, tabella diversa con lo stesso spazio di uuid — un
 * `update` alla cieca su `acqualatina_ordini` sarebbe quasi certamente un no-op silenzioso, ma
 * «quasi certamente» non è una garanzia da cui far dipendere l'integrità di un altro registro),
 * o un intervento non ancora agganciato (`ordine_id` nullo — l'aggancio lo colma più tardi).
 */
export async function propagaAnagraficaARegistro(
  db: SupabaseClient,
  interventoId: string,
  patch: RegistroAnagraficaPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { data, error } = await db
    .from('interventi')
    .select('ordine_id, committente')
    .eq('id', interventoId)
    .maybeSingle();
  if (error) { console.error('[acqualatina] lettura intervento per anagrafica registro fallita:', error.message); return; }
  const row = data as { ordine_id: string | null; committente: string | null } | null;
  if (!row || row.committente !== 'acqualatina' || !row.ordine_id) return;
  const { error: eReg } = await db
    .from('acqualatina_ordini')
    .update({ ...patch, aggiornato_il: new Date().toISOString() })
    .eq('id', row.ordine_id);
  if (eReg) console.error('[acqualatina] anagrafica non propagata al registro:', eReg.message);
}
