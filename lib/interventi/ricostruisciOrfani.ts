// lib/interventi/ricostruisciOrfani.ts
// Ricostruisce l'intervento delle voci ESITATE rimaste senza, UNA PER UNA e solo quelle.
//
// PERCHE' NON `ensureInterventiForPiano`
// Quella funzione e` il ripristino del PIANO: rigenera tutti i suoi task, ed e` giusto per il
// bottone «Rigenera interventi», che si preme su una giornata sapendo cosa comporta. Usata per
// recuperare le orfane fa un lavoro sproporzionato — il 17/08/2026, su 15 giornate, ha creato
// 445 interventi per recuperarne 210: i 235 di troppo erano lavoro pianificato e mai
// rendicontato, ricomparso come «assegnato» su giornate di giugno.
//
// Qui si parte dal problema invece che dal piano: per OGNI voce orfana si ritrova il SUO task
// e si ricrea il SUO intervento. Nessun task che non abbia una voce dietro viene toccato,
// quindi non c'e' collaterale da ripulire.
//
// Non si inventa niente: il task del piano e` la fonte di verita` (`mappa_piani_operatori.tasks`)
// e porta gia` tutto — ODL, PDR, matricola, indirizzo, CAP, comune, nominativo, recapito,
// coordinate, attivita`. La mappatura e` la stessa del percorso normale (`taskToIntervento`),
// quindi committente e gruppo attivita` escono dalla tassonomia esattamente come sarebbero
// usciti alla creazione.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '@/utils/routing/types';
import { taskDellaVoce } from '@/lib/interventi/taskDellaVoce';
import { taskToIntervento } from '@/lib/interventi/taskToIntervento';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex } from '@/lib/attivita/tassonomia';

export type EsitoRicostruzione = { ricostruiti: number; senzaTask: number };

type VoceOrfana = {
  id: string;
  task_id: string | null;
  odl: string | null;
  rapportino_id: string;
  risposte: Record<string, unknown>;
  campi_snapshot: unknown;
  /** Ora reale di compilazione: diventa `chiuso_at`, non l'istante del recupero. */
  updated_at: string;
};

/**
 * Ricostruisce gli interventi mancanti delle voci orfane di una giornata e le riaggancia.
 *
 * `created_from_mappa: false` di proposito, come fa la pianificazione della commessa: e` la
 * protezione per-riga contro la rigenerazione della Mappa, che elimina e ricrea le righe
 * `true` — e una ricreazione azzera `intervento_id` sulla voce (`on delete set null`),
 * cioe` rifabbricherebbe l'orfana che stiamo riparando.
 */
export async function ricostruisciOrfaniDelGiorno(
  db: SupabaseClient,
  data: string,
): Promise<EsitoRicostruzione> {
  const { data: rapRows } = await db
    .from('rapportini').select('id, staff_id, piano_id, campi_snapshot').eq('data', data);
  const rapportini = ((rapRows ?? []) as Array<{
    id: string; staff_id: string | null; piano_id: string | null; campi_snapshot: unknown;
  }>).filter((r) => r.piano_id && r.staff_id);
  if (rapportini.length === 0) return { ricostruiti: 0, senzaTask: 0 };

  const { data: vociRows } = await db
    .from('rapportino_voci')
    .select('id, task_id, odl, rapportino_id, risposte, campi_snapshot, updated_at, approvazione_stato')
    .in('rapportino_id', rapportini.map((r) => r.id))
    .is('intervento_id', null);
  const orfane = ((vociRows ?? []) as Array<Record<string, unknown>>)
    .filter((v) => String((v.risposte as Record<string, unknown> | null)?.eseguito ?? '').trim() !== '')
    .filter((v) => String(v.approvazione_stato ?? '') !== 'rifiutato')
    .map((v) => ({
      id: String(v.id), task_id: (v.task_id as string | null) ?? null,
      odl: (v.odl as string | null) ?? null, rapportino_id: String(v.rapportino_id),
      risposte: (v.risposte as Record<string, unknown> | null) ?? {},
      campi_snapshot: v.campi_snapshot,
      updated_at: String(v.updated_at ?? ''),
    })) as VoceOrfana[];
  if (orfane.length === 0) return { ricostruiti: 0, senzaTask: 0 };

  const rapById = new Map(rapportini.map((r) => [r.id, r]));
  const pianiIds = [...new Set(rapportini.map((r) => String(r.piano_id)))];

  const [{ data: pianiRows }, { data: opRows }, { data: terrRows }] = await Promise.all([
    db.from('mappa_piani').select('id, data, territorio').in('id', pianiIds),
    db.from('mappa_piani_operatori').select('piano_id, staff_id, tasks').in('piano_id', pianiIds),
    db.from('territories').select('id, name'),
  ]);
  const pianoById = new Map(((pianiRows ?? []) as Array<{ id: string; data: string; territorio: string | null }>)
    .map((p) => [p.id, p]));
  const tasksByKey = new Map<string, Task[]>();
  for (const o of (opRows ?? []) as Array<{ piano_id: string; staff_id: string; tasks: unknown }>) {
    tasksByKey.set(`${o.piano_id}|${o.staff_id}`, (Array.isArray(o.tasks) ? o.tasks : []) as Task[]);
  }
  const territorioIdByName = new Map(
    ((terrRows ?? []) as Array<{ id: string; name: string }>)
      .map((t) => [String(t.name ?? '').trim().toLowerCase(), String(t.id)]),
  );

  const indice = buildTassonomiaIndex(await caricaTassonomia());

  let ricostruiti = 0;
  let senzaTask = 0;
  for (const v of orfane) {
    const rap = rapById.get(v.rapportino_id);
    const piano = rap?.piano_id ? pianoById.get(String(rap.piano_id)) : null;
    if (!rap || !piano) { senzaTask += 1; continue; }
    const task = taskDellaVoce(tasksByKey.get(`${piano.id}|${rap.staff_id}`) ?? [], v);
    if (!task) { senzaTask += 1; continue; }

    const territorioId = piano.territorio
      ? (territorioIdByName.get(piano.territorio.trim().toLowerCase()) ?? null)
      : null;
    // Base 'acea' come il percorso normale: `taskToIntervento` deriva poi il committente VERO
    // dalla tassonomia dell'attività del task.
    const riga = taskToIntervento(
      task,
      { committente: 'acea', data, staffId: String(rap.staff_id), pianoId: piano.id, territorioId, territorioIdByName },
      indice,
    );

    /*
      L'esito si scrive NELLO STESSO insert, con le regole del percorso normale
      (`esitoInterventoDaVoce`: il verde chiude in positivo, il rosso chiude senza, il neutro
      non chiude — e su AcquaLatina la matricola obbligatoria e` un gate vero). Farlo qui evita
      la passata di riallineamento su TUTTE le voci del giorno, che e` cio` che ha fatto scadere
      la prima versione del recupero.
    */
    const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
      ? (v.campi_snapshot as TemplateCampo[])
      : ((rap.campi_snapshot ?? []) as TemplateCampo[]);
    const patch = esitoInterventoDaVoce(v.risposte, campiV);
    const chiusura = patch
      ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: v.updated_at || null }
      : {};

    const { data: creato, error } = await db
      .from('interventi')
      .insert({ ...riga, created_from_mappa: false, ...chiusura })
      .select('id')
      .single();
    // 23505 = l'intervento esiste già sotto un'altra chiave (un altro giorno, un altro
    // committente): non è un guasto, è una riga che questo recupero non deve creare.
    if (error || !creato) {
      if (error && !/duplicate key|23505/i.test(error.message)) {
        console.error('[ricostruisci orfani] insert fallita:', error.message);
      }
      senzaTask += 1;
      continue;
    }
    const { error: eLink } = await db
      .from('rapportino_voci').update({ intervento_id: (creato as { id: string }).id }).eq('id', v.id);
    if (eLink) {
      console.error('[ricostruisci orfani] aggancio fallito:', eLink.message);
      continue;
    }
    ricostruiti += 1;
  }
  return { ricostruiti, senzaTask };
}
