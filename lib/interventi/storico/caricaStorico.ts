// lib/interventi/storico/caricaStorico.ts
// SERVER-ONLY: legge rapportino_voci (+ rapportino padre), normalizza e filtra.
// Condiviso tra la route lista e la route export.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTassonomiaIndex } from '@/lib/attivita/tassonomia';
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import { risolviFinestra, puliziaQ, type FiltriStorico } from './filtri';
import {
  voceToRigaStorico, interventoPiToRigaStorico, ordinaRighe, filtraSiNo, filtraMulti,
  type InterventoPiRow, type TassonomiaIndex, type TerritoriById,
} from './normalizza';
import type { VoceStoricoRow, RigaStorico } from './types';

const PAGE_DB = 1000;

const COLONNE =
  'id, odl, via, comune, matricola, nominativo, pdr, attivita, risposte, manuale, rapportini!inner(staff_id, staff_name, data), interventi(committente, gruppo_attivita, territorio_id)';

/** Carica la mappa staff_id → display_name. */
export async function caricaStaff(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase.from('staff').select('id, display_name');
  for (const s of (data ?? []) as Array<{ id: string; display_name: string }>) map.set(s.id, s.display_name);
  return map;
}

/** Mappa territories.id → name per risolvere il territorio delle righe. Resiliente:
 * su errore torna una mappa vuota (il territorio resta non risolto, niente 500). */
export async function caricaTerritori(supabase: SupabaseClient): Promise<TerritoriById> {
  const map: TerritoriById = new Map();
  const { data } = await supabase.from('territories').select('id, name');
  for (const t of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (t.name) map.set(t.id, t.name);
  }
  return map;
}

/** Indice della tassonomia attività per risolvere il gruppo delle righe. Resiliente:
 * su errore torna un indice vuoto (il gruppo resta non risolto, niente 500). */
export async function caricaTassonomiaIndex(supabase: SupabaseClient): Promise<TassonomiaIndex> {
  const { data, error } = await supabase
    .from('attivita_tassonomia')
    .select('committente, descrizione, descrizione_norm, gruppo, attivo');
  if (error) return new Map();
  return buildTassonomiaIndex(
    ((data ?? []) as Array<{ committente: string; descrizione: string; descrizione_norm: string; gruppo: string; attivo: boolean }>)
      .map((r) => ({
        committente: r.committente,
        descrizione: r.descrizione,
        descrizioneNorm: r.descrizione_norm,
        gruppo: r.gruppo,
        attivo: r.attivo,
      })),
  );
}

/**
 * Carica le righe storico (rapportino_voci) applicando i filtri.
 * - data/esecutori filtrati sul rapportino padre (embed inner), comune/q sulla voce;
 * - i filtri SI/NO (eseguito/valvola/mini bag/rg stop) e committente/gruppo attività
 *   sono applicati in memoria sul valore normalizzato/risolto.
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
  const [tassonomia, territori] = await Promise.all([
    caricaTassonomiaIndex(supabase),
    caricaTerritori(supabase),
  ]);
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
    if (f.esecutori.length > 0) q = q.in('rapportini.staff_id', f.esecutori);
    if (f.comune) q = q.ilike('comune', `%${puliziaQ(f.comune)}%`);
    if (qPulita) {
      q = q.or(
        `odl.ilike.%${qPulita}%,via.ilike.%${qPulita}%,matricola.ilike.%${qPulita}%,nominativo.ilike.%${qPulita}%,pdr.ilike.%${qPulita}%,risposte->>sigillo.ilike.%${qPulita}%`,
      );
    }
    const { data: batch, error } = await q;
    if (error) throw error;
    const rows = (batch ?? []) as unknown as VoceStoricoRow[];
    for (const row of rows) {
      // Voce CONTENITORE task-via VUOTA (attività BONIFICHE EXTRA con la sola via, SENZA matricola):
      // NON si mostra nello storico. Un contenitore è una voce PIANIFICATA (manuale=false): i "+"
      // (manuale=true) sono interventi VERI e restano SEMPRE, anche senza matricola e anche ora che
      // nascono con attività BONIFICHE EXTRA (il loro gruppo arriva comunque dall'intervento collegato).
      // Senza la guardia `manuale` un "+" bonifica senza matricola sparirebbe dallo storico.
      const haMatricola = Boolean(row.matricola && String(row.matricola).trim());
      if (isTaskVia(row) && row.manuale !== true && !haMatricola) continue;
      righe.push(voceToRigaStorico(row, staffById, tassonomia, territori));
    }
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
    .select('id, indirizzo, comune, data, staff_id, rif_esterno, intervento_tipo, committente, gruppo_attivita, territorio_id, esito, esito_motivo')
    .eq('origine', 'pronto_intervento');
  if (finestra.eq) qpi = qpi.eq('data', finestra.eq);
  if (finestra.gte) qpi = qpi.gte('data', finestra.gte);
  if (finestra.lte) qpi = qpi.lte('data', finestra.lte);
  if (f.esecutori.length > 0) qpi = qpi.in('staff_id', f.esecutori);
  if (f.comune) qpi = qpi.ilike('comune', `%${puliziaQ(f.comune)}%`);
  if (qPulita) qpi = qpi.or(`indirizzo.ilike.%${qPulita}%,rif_esterno.ilike.%${qPulita}%`);
  const { data: piRows } = await qpi;
  for (const r of (piRows ?? []) as InterventoPiRow[]) righe.push(interventoPiToRigaStorico(r, staffById, tassonomia, territori));

  const filtrate = filtraMulti(filtraSiNo(righe, f), f);
  return { righe: ordinaRighe(filtrate), troncato };
}
