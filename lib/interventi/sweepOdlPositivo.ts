// lib/interventi/sweepOdlPositivo.ts
// Sweep dell'invariante "ODL positivo = definitivamente chiuso" per i positivi che arrivano
// DOPO la generazione dei rapportini: il gate in creazione (planInterventi/sincronizzaRapportini)
// non può vederli, quindi appena un esito positivo tocca il DB le voci NON compilate con lo
// stesso ODL negli altri rapportini aperti vengono eliminate, insieme all'intervento pianificato
// ancora aperto — come se la generazione le avesse escluse fin dall'inizio.
// Mai toccati: voci con risposte (lavoro registrato), voci manuali, rapportini INVIATI,
// interventi terminali (completato/annullato). Per quei casi resta il backstop all'invio
// (decidiChiusuraConPositivi). Best-effort: i chiamanti non falliscono mai per lo sweep.
import type { SupabaseClient } from '@supabase/supabase-js';
import { chiavePositivo, normOdl } from './odlPositivi';
import { caricaPositiviInfo } from './caricaOdlPositivi';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';

/** Stati di un intervento ancora aperto (nessun esito registrato). */
export const STATI_APERTI = ['da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione'];

export type PositivoChiuso = { id: string; odl: string | null; committente: string | null; esito: string | null };
export type CandidatoSweep = { id: string; odl: string | null; committente: string | null; stato: string };
export type VoceSweep = {
  id: string;
  intervento_id: string | null;
  odl: string | null;
  risposte: Record<string, unknown> | null;
  manuale: boolean | null;
  /** stato del rapportino che contiene la voce ('inviato' = intoccabile). */
  rapportinoStato: string | null;
};

export type PianoSweep = { vociDaEliminare: string[]; interventiDaEliminare: string[] };

/** Chiave dell'invariante: classe committente (lim_massive ≡ acea) + ODL normalizzato. */
function chiaveSweep(committente: string | null | undefined, odl: string | null | undefined): string {
  return chiavePositivo(committenteEquivalente(committente) || 'acea', odl);
}

function voceCompilata(risposte: Record<string, unknown> | null | undefined): boolean {
  return Object.keys(risposte ?? {}).length > 0;
}

/**
 * PURA: decide cosa eliminare dato l'insieme dei positivi appena registrati.
 * - candidati: interventi con lo stesso ODL su altre righe → eliminati solo se APERTI e
 *   non referenziati da una voce che sopravvive (compilata/manuale/in rapportino inviato);
 * - voci: eliminate solo se NON compilate, NON manuali e in rapportini non inviati.
 *   Le voci scollegate (intervento_id null) si agganciano per ODL.
 */
export function pianificaSweep(args: {
  positivi: PositivoChiuso[];
  candidati: CandidatoSweep[];
  voci: VoceSweep[];
}): PianoSweep {
  const { positivi, candidati, voci } = args;
  const chiaviPositivi = new Set<string>();
  const odlPositivi = new Set<string>();
  const idPositivi = new Set<string>();
  for (const p of positivi) {
    if (p.esito !== 'eseguito_positivo') continue;
    const k = normOdl(p.odl);
    if (!k) continue;
    chiaviPositivi.add(chiaveSweep(p.committente, p.odl));
    odlPositivi.add(k);
    idPositivi.add(p.id);
  }
  if (chiaviPositivi.size === 0) return { vociDaEliminare: [], interventiDaEliminare: [] };

  const interventiRevocabili = new Set(
    candidati
      .filter((c) => !idPositivi.has(c.id))
      .filter((c) => STATI_APERTI.includes(c.stato))
      .filter((c) => chiaviPositivi.has(chiaveSweep(c.committente, c.odl)))
      .map((c) => c.id),
  );

  const vociDaEliminare: string[] = [];
  // Interventi revocabili referenziati da una voce che SOPRAVVIVE (lavoro registrato):
  // non si eliminano — li chiuderà il backstop all'invio del rapportino.
  const interventiProtetti = new Set<string>();
  for (const v of voci) {
    const agganciata = v.intervento_id ? interventiRevocabili.has(v.intervento_id) : odlPositivi.has(normOdl(v.odl));
    if (!agganciata) continue;
    const eliminabile = !voceCompilata(v.risposte) && !v.manuale && v.rapportinoStato !== 'inviato';
    if (eliminabile) vociDaEliminare.push(v.id);
    else if (v.intervento_id) interventiProtetti.add(v.intervento_id);
  }

  return {
    vociDaEliminare,
    interventiDaEliminare: [...interventiRevocabili].filter((id) => !interventiProtetti.has(id)),
  };
}

export type SweepRisultato = { vociEliminate: number; interventiEliminati: number };

/**
 * Esegue lo sweep per gli interventi appena chiusi POSITIVI (ids qualsiasi: i non-positivi
 * vengono ignorati). Qualsiasi data e qualsiasi piano: un positivo revoca anche le voci dei
 * piani futuri già generati. L'ordine (prima voci, poi interventi) rispetta la FK.
 */
export async function sweepDopoPositivi(db: SupabaseClient, interventoIds: string[]): Promise<SweepRisultato> {
  const zero: SweepRisultato = { vociEliminate: 0, interventiEliminati: 0 };
  const ids = [...new Set(interventoIds.filter(Boolean))];
  if (ids.length === 0) return zero;

  const { data: posRows } = await db
    .from('interventi')
    .select('id, odl, committente, esito')
    .in('id', ids)
    .eq('esito', 'eseguito_positivo');
  const positivi = ((posRows ?? []) as PositivoChiuso[]).filter((p) => (p.odl ?? '').trim());
  if (positivi.length === 0) return zero;
  const odls = [...new Set(positivi.map((p) => (p.odl ?? '').trim()))];

  const { data: candRows } = await db
    .from('interventi')
    .select('id, odl, committente, stato')
    .in('odl', odls)
    .in('stato', STATI_APERTI)
    .not('id', 'in', `(${ids.join(',')})`);
  const candidati = (candRows ?? []) as CandidatoSweep[];

  // Voci agganciate ai candidati + voci scollegate con lo stesso ODL (link race).
  const vociSelect = 'id, intervento_id, odl, risposte, manuale, rapportini!inner(stato)';
  type VoceRow = Omit<VoceSweep, 'rapportinoStato'> & {
    rapportini: { stato: string | null } | Array<{ stato: string | null }>;
  };
  const toVoce = (v: VoceRow): VoceSweep => {
    const rap = Array.isArray(v.rapportini) ? v.rapportini[0] : v.rapportini;
    return { id: v.id, intervento_id: v.intervento_id, odl: v.odl, risposte: v.risposte, manuale: v.manuale, rapportinoStato: rap?.stato ?? null };
  };
  const voci: VoceSweep[] = [];
  if (candidati.length > 0) {
    const { data: vociLink } = await db
      .from('rapportino_voci')
      .select(vociSelect)
      .in('intervento_id', candidati.map((c) => c.id));
    voci.push(...((vociLink ?? []) as unknown as VoceRow[]).map(toVoce));
  }
  const { data: vociOrfane } = await db
    .from('rapportino_voci')
    .select(vociSelect)
    .in('odl', odls)
    .is('intervento_id', null);
  voci.push(...((vociOrfane ?? []) as unknown as VoceRow[]).map(toVoce));

  const piano = pianificaSweep({ positivi, candidati, voci });

  if (piano.vociDaEliminare.length > 0) {
    const { error } = await db.from('rapportino_voci').delete().in('id', piano.vociDaEliminare);
    if (error) {
      console.error('[sweepOdlPositivo] delete voci fallita:', error.message);
      return zero; // niente delete interventi se le voci non sono state rimosse
    }
  }
  if (piano.interventiDaEliminare.length > 0) {
    const { error } = await db
      .from('interventi')
      .delete()
      .in('id', piano.interventiDaEliminare)
      .in('stato', STATI_APERTI); // guardia contro chiusure concorrenti
    if (error) console.error('[sweepOdlPositivo] delete interventi fallita:', error.message);
  }
  return { vociEliminate: piano.vociDaEliminare.length, interventiEliminati: piano.interventiDaEliminare.length };
}

/**
 * Sweep "verso se stesso" all'INVIO di un rapportino: elimina le voci NON compilate il cui ODL
 * risulta già positivo altrove (con l'intervento pianificato aperto collegato), PRIMA del gate
 * esiti-mancanti — altrimenti una voce bloccata lato operatore renderebbe il rapportino
 * ininviabile. Le voci compilate non si toccano (le gestisce decidiChiusuraConPositivi).
 */
export async function rimuoviVociBloccate(db: SupabaseClient, rapportinoId: string): Promise<SweepRisultato> {
  const zero: SweepRisultato = { vociEliminate: 0, interventiEliminati: 0 };
  const { data: vociRows } = await db
    .from('rapportino_voci')
    .select('id, odl, intervento_id, risposte, manuale')
    .eq('rapportino_id', rapportinoId);
  const candidate = ((vociRows ?? []) as Array<{
    id: string; odl: string | null; intervento_id: string | null;
    risposte: Record<string, unknown> | null; manuale: boolean | null;
  }>).filter((v) => !v.manuale && !voceCompilata(v.risposte) && (v.odl ?? '').trim());
  if (candidate.length === 0) return zero;

  const positivi = await caricaPositiviInfo(db, candidate.map((v) => v.odl));
  const bloccate = candidate.filter((v) => {
    const pos = positivi.get(normOdl(v.odl));
    return pos && pos.id !== v.intervento_id;
  });
  if (bloccate.length === 0) return zero;

  const { error } = await db.from('rapportino_voci').delete().in('id', bloccate.map((v) => v.id));
  if (error) {
    console.error('[rimuoviVociBloccate] delete voci fallita:', error.message);
    return zero;
  }
  const interventoIds = [...new Set(bloccate.map((v) => v.intervento_id).filter((x): x is string => !!x))];
  if (interventoIds.length > 0) {
    const { error: eInt } = await db.from('interventi').delete().in('id', interventoIds).in('stato', STATI_APERTI);
    if (eInt) console.error('[rimuoviVociBloccate] delete interventi fallita:', eInt.message);
  }
  return { vociEliminate: bloccate.length, interventiEliminati: interventoIds.length };
}
