// lib/interventi/storico/caricaStorico.ts
// SERVER-ONLY: legge rapportino_voci (+ rapportino padre), normalizza e filtra.
// Condiviso tra la route lista e la route export.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { risolviFinestra, puliziaQ, type FiltriStorico } from './filtri';
import { voceToRigaStorico, interventoPiToRigaStorico, ordinaRighe, filtraSiNo, type InterventoPiRow } from './normalizza';
import type { VoceStoricoRow, RigaStorico } from './types';

const PAGE_DB = 1000;

const COLONNE =
  'id, odl, via, comune, matricola, nominativo, pdr, attivita, risposte, manuale, rapportini!inner(staff_id, staff_name, data)';

/** Carica la mappa staff_id → display_name. */
export async function caricaStaff(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase.from('staff').select('id, display_name');
  for (const s of (data ?? []) as Array<{ id: string; display_name: string }>) map.set(s.id, s.display_name);
  return map;
}

/**
 * Carica le righe storico (rapportino_voci) applicando i filtri.
 * - data/esecutore filtrati sul rapportino padre (embed inner), comune/q sulla voce;
 * - i filtri SI/NO (eseguito/valvola/mini bag/rg stop) sono applicati in memoria sul valore normalizzato.
 * `maxRighe` limita la lettura (cap di sicurezza): se raggiunto, `troncato=true`.
 */
export async function caricaRigheStorico(
  supabase: SupabaseClient,
  f: FiltriStorico,
  staffById: Map<string, string>,
  maxRighe: number,
): Promise<{ righe: RigaStorico[]; troncato: boolean }> {
  const finestra = risolviFinestra(f);
  const qPulita = puliziaQ(f.q);
  let troncato = false;
  const righe: RigaStorico[] = [];

  for (let offset = 0; offset < maxRighe; offset += PAGE_DB) {
    let q = supabase
      .from('rapportino_voci')
      .select(COLONNE)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_DB - 1);
    if (finestra.eq) q = q.eq('rapportini.data', finestra.eq);
    if (finestra.gte) q = q.gte('rapportini.data', finestra.gte);
    if (finestra.lte) q = q.lte('rapportini.data', finestra.lte);
    if (f.esecutore) q = q.eq('rapportini.staff_id', f.esecutore);
    if (f.comune) q = q.ilike('comune', `%${puliziaQ(f.comune)}%`);
    if (qPulita) {
      q = q.or(
        `odl.ilike.%${qPulita}%,via.ilike.%${qPulita}%,matricola.ilike.%${qPulita}%,nominativo.ilike.%${qPulita}%,pdr.ilike.%${qPulita}%`,
      );
    }
    const { data: batch, error } = await q;
    if (error) throw error;
    const rows = (batch ?? []) as unknown as VoceStoricoRow[];
    for (const row of rows) righe.push(voceToRigaStorico(row, staffById));
    if (rows.length < PAGE_DB) break;
    if (offset + PAGE_DB >= maxRighe) {
      troncato = true;
      break;
    }
  }

  // P.I.: gli interventi origine='pronto_intervento' NON hanno una voce di rapportino
  // (il modulo Interventi è il contenitore di tutti gli interventi) → includili a parte.
  let qpi = supabase
    .from('interventi')
    .select('id, indirizzo, comune, data, staff_id, rif_esterno, intervento_tipo, esito, esito_motivo')
    .eq('origine', 'pronto_intervento');
  if (finestra.eq) qpi = qpi.eq('data', finestra.eq);
  if (finestra.gte) qpi = qpi.gte('data', finestra.gte);
  if (finestra.lte) qpi = qpi.lte('data', finestra.lte);
  if (f.esecutore) qpi = qpi.eq('staff_id', f.esecutore);
  if (f.comune) qpi = qpi.ilike('comune', `%${puliziaQ(f.comune)}%`);
  if (qPulita) qpi = qpi.or(`indirizzo.ilike.%${qPulita}%,rif_esterno.ilike.%${qPulita}%`);
  const { data: piRows } = await qpi;
  for (const r of (piRows ?? []) as InterventoPiRow[]) righe.push(interventoPiToRigaStorico(r, staffById));

  const filtrate = filtraSiNo(righe, f);
  return { righe: ordinaRighe(filtrate), troncato };
}
