// lib/acea/pianoCommessa.ts
// Il piano VERO della commessa (ACEA / ACQUA LATINA): scelta deterministica del piano di
// (data, territorio) per un operatore, e sincronizzazione della sua riga in
// `mappa_piani_operatori` con i task derivati dagli interventi del registro.
//
// È il pezzo che manda in pensione il piano-contenitore: il percorso commessa produce gli
// stessi artefatti del percorso Excel (piano con operatori e task, interventi con `piano_id`),
// così la vista pianifica li mostra e `orphanRapportini` non ha più rapportini senza riga
// operatore da radere. Le scritture restano ai motori che le possiedono: qui si scrive SOLO
// la riga operatore (con i task `acea:*`) — mai le voci, mai i rapportini.
//
// La chiave di aggancio fra i due mondi è il task deterministico `Task.id = taskIdAcea(id)`
// (`'acea:<interventoId>'`), lo stesso già usato come `task_id` delle voci del motore acea:
// rende idempotente ogni incrocio fra i due motori (G1/G2 in sincronizzaRapportini).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '@/utils/routing/types';
import { taskIdAcea } from '@/lib/acea/vociRapportino';
import { buildIdByName } from '@/lib/interventi/territorioOverride';

/** Riga di `interventi` sufficiente a costruire il Task del piano. Tutte le colonne nullable. */
export type InterventoCommessa = {
  id: string;
  odl?: string | null;
  pdr?: string | null;
  matricola_contatore?: string | null;
  nominativo?: string | null;
  recapito?: string | null;
  indirizzo?: string | null;
  comune?: string | null;
  cap?: string | null;
  intervento_tipo?: string | null;
  /** Calibro del misuratore (AcquaLatina). */
  diametro?: string | null;
  committente?: string | null;
  fascia_oraria?: string | null;
};

/**
 * Task del piano da un intervento del registro.
 *
 * `id` è deterministico (`taskIdAcea`): due sincronizzazioni producono lo stesso task, e il
 * task coincide col `task_id` della voce acea — è ciò che permette a G1 di riconoscere «già
 * rendicontato» con un match esatto. `committente` è ESPLICITO: per `taskToIntervento` un
 * committente esplicito blocca la sonda tassonomia cross-catalogo, quindi anche se un giorno
 * la Mappa rigenerasse questi task, l'intervento non verrebbe reinstradato su un altro
 * committente.
 */
export function interventoToTask(i: InterventoCommessa): Task {
  return {
    id: taskIdAcea(i.id),
    odl: (i.odl ?? '').trim(),
    pdr: i.pdr ?? undefined,
    indirizzo: i.indirizzo ?? '',
    cap: i.cap ?? '',
    citta: i.comune ?? '',
    priorita: 0,
    fascia_oraria: i.fascia_oraria ?? '',
    nominativo: i.nominativo ?? undefined,
    matricola: i.matricola_contatore ?? undefined,
    calibro: i.diametro ?? undefined,
    recapito: i.recapito ?? undefined,
    attivita: i.intervento_tipo ?? undefined,
    committente: i.committente ?? undefined,
  };
}

export type PianoCandidato = {
  id: string;
  created_at?: string | null;
  note?: string | null;
};

/**
 * La nota-sentinella dei vecchi piani-contenitore (due varianti storiche: «…generati dal
 * registro commesse.» e «…della commessa ACEA.»). Quando il piano viene adottato come piano
 * vero, la nota va azzerata: non è più un guscio.
 */
export function eNotaContenitore(note: string | null | undefined): boolean {
  return /^contenitore dei rapportini/i.test(String(note ?? '').trim());
}

/**
 * Quale piano di (data, territorio commessa) è IL piano di questo operatore.
 *
 * Deterministica e per-operatore — sostituisce il vecchio `assicuraPianoCommessa`, che
 * prendeva il primo piano del giorno senza order-by e senza guardare l'operatore (causa del
 * rischio-orfani: rapportino su un piano Excel il cui staff non era fra gli operatori).
 *
 * Precedenza:
 *  1. il piano dove l'operatore ha GIÀ un rapportino — il rapportino non si sposta mai,
 *     quindi tutto il resto (interventi, riga operatore) converge lì;
 *  2. il piano dove l'operatore è GIÀ in `mappa_piani_operatori` (es. il piano Excel del
 *     giorno che lo contiene: commessa ed Excel convergono sullo stesso piano);
 *  3. il più vecchio di (data, territorio) — `created_at` asc, id come spareggio;
 *  4. `null` = nessun piano: il chiamante lo crea.
 *
 * Le regole 1-2 garantiscono che un operatore stia su UN solo piano per (data, territorio):
 * niente conflitti latenti fra piano commessa e piano Excel omonimo.
 */
export function scegliPianoCommessa(
  piani: readonly PianoCandidato[],
  pianiConRapportino: ReadonlySet<string>,
  pianiConRigaOperatore: ReadonlySet<string>,
): string | null {
  const ordinati = [...piani].sort(
    (a, b) =>
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) ||
      a.id.localeCompare(b.id),
  );
  return (
    ordinati.find((p) => pianiConRapportino.has(p.id))?.id ??
    ordinati.find((p) => pianiConRigaOperatore.has(p.id))?.id ??
    ordinati[0]?.id ??
    null
  );
}

export type ContestoPiani = {
  ok: true;
  /** Piani di (data, territorio), mutabile: il chiamante vi aggiunge quello appena creato. */
  piani: Array<{ id: string; created_at: string | null; note: string | null }>;
  /** piano_id → staff_id presenti in `mappa_piani_operatori`. */
  operatoriPerPiano: Map<string, Set<string>>;
};

/** Le due letture con cui si applica `scegliPianoCommessa`: piani del giorno e righe operatore. */
export async function caricaContestoPiani(
  db: SupabaseClient,
  data: string,
  territorio: string,
): Promise<ContestoPiani | { ok: false; error: string }> {
  const { data: pianiRows, error: ePiani } = await db
    .from('mappa_piani')
    .select('id, created_at, note')
    .eq('data', data)
    .eq('territorio', territorio);
  if (ePiani) return { ok: false, error: ePiani.message };
  const piani = ((pianiRows ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    created_at: (p.created_at as string | null) ?? null,
    note: (p.note as string | null) ?? null,
  }));

  const operatoriPerPiano = new Map<string, Set<string>>();
  if (piani.length > 0) {
    const { data: opRows, error: eOp } = await db
      .from('mappa_piani_operatori')
      .select('piano_id, staff_id')
      .in('piano_id', piani.map((p) => p.id));
    if (eOp) return { ok: false, error: eOp.message };
    for (const o of (opRows ?? []) as Array<{ piano_id: string; staff_id: string }>) {
      const set = operatoriPerPiano.get(String(o.piano_id)) ?? new Set<string>();
      set.add(String(o.staff_id));
      operatoriPerPiano.set(String(o.piano_id), set);
    }
  }
  return { ok: true, piani, operatoriPerPiano };
}

/**
 * Crea il piano della commessa: `stato='confermato'` (piano generato = confermato, come
 * l'agente) e `note: null` — la nota-sentinella «Contenitore…» muore con il guscio.
 */
export async function creaPianoCommessa(
  db: SupabaseClient,
  data: string,
  territorio: string,
  attoreId: string,
): Promise<{ ok: true; pianoId: string } | { ok: false; error: string }> {
  const { data: ins, error } = await db
    .from('mappa_piani')
    .insert({ data, territorio, note: null, stato: 'confermato', created_by: attoreId, updated_by: attoreId })
    .select('id')
    .single();
  if (error || !ins) return { ok: false, error: error?.message ?? 'Creazione piano commessa fallita.' };
  return { ok: true, pianoId: String((ins as { id: string }).id) };
}

/** `territories.id` del territorio della commessa (match per nome, come territorioOverride). */
export async function risolviTerritorioIdCommessa(
  db: SupabaseClient,
  nomeTerritorio: string,
): Promise<string | null> {
  const { data: terr } = await db.from('territories').select('id, name');
  return buildIdByName((terr ?? []) as Array<{ id: string; name: string }>)
    .get(nomeTerritorio.trim().toLowerCase()) ?? null;
}

export type EsitoSincronizzaOperatore = { ok: true } | { ok: false; error: string };

/**
 * Allinea la riga di `mappa_piani_operatori` di (piano, operatore) agli interventi del
 * registro che vi puntano: upsert della riga (PK piano_id+staff_id) con i task `acea:*`
 * ricostruiti dagli interventi commessa non annullati.
 *
 * Regole:
 *  - i task NON-`acea:*` già presenti (Excel, '+') restano: questo motore possiede solo i suoi;
 *  - la riga resta anche a 0 task — è il comportamento di un piano Excel svuotato, e toglierla
 *    con un rapportino presente innescherebbe `orphanRapportini`;
 *  - si escludono gli interventi `created_from_mappa=true` (posseduti dalla Mappa: sono GIÀ
 *    nei task del piano), gli annullati e i manuali dal «+» (nel percorso Excel il «+» non
 *    diventa mai un task: produce solo la voce).
 */
export async function sincronizzaOperatorePiano(
  db: SupabaseClient,
  pianoId: string,
  staffId: string,
  opts: { staffName?: string | null } = {},
): Promise<EsitoSincronizzaOperatore> {
  const { data: intRows, error: eInt } = await db
    .from('interventi')
    .select(
      'id, odl, pdr, matricola_contatore, nominativo, recapito, indirizzo, comune, cap, intervento_tipo, diametro, committente, fascia_oraria, stato, origine, created_from_mappa',
    )
    .eq('piano_id', pianoId)
    .eq('staff_id', staffId);
  if (eInt) return { ok: false, error: eInt.message };

  const commessa = ((intRows ?? []) as Array<Record<string, unknown>>).filter(
    (r) =>
      r.created_from_mappa !== true &&
      String(r.stato ?? '') !== 'annullato' &&
      String(r.origine ?? '') !== 'manuale',
  );
  const tasksAcea = commessa
    .map((r) => interventoToTask(r as unknown as InterventoCommessa))
    // Ordine deterministico: due sincronizzazioni producono lo stesso JSONB.
    .sort(
      (a, b) =>
        a.odl.localeCompare(b.odl) ||
        String(a.matricola ?? '').localeCompare(String(b.matricola ?? '')) ||
        a.id.localeCompare(b.id),
    );

  const { data: rigaEsistente, error: eRiga } = await db
    .from('mappa_piani_operatori')
    .select('piano_id, staff_id, tasks')
    .eq('piano_id', pianoId)
    .eq('staff_id', staffId)
    .maybeSingle();
  if (eRiga) return { ok: false, error: eRiga.message };

  if (rigaEsistente) {
    const esistenti = Array.isArray((rigaEsistente as { tasks?: unknown }).tasks)
      ? ((rigaEsistente as { tasks: unknown[] }).tasks as Array<{ id?: unknown }>)
      : [];
    // I task altrui (Excel, '+') restano al loro posto; i nostri `acea:*` si riscrivono da zero.
    const nonAcea = esistenti.filter((t) => !String(t?.id ?? '').startsWith('acea:'));
    const tasks = [...nonAcea, ...tasksAcea];
    const { error: eUpd } = await db
      .from('mappa_piani_operatori')
      .update({ tasks, task_count: tasks.length })
      .eq('piano_id', pianoId)
      .eq('staff_id', staffId);
    if (eUpd) return { ok: false, error: eUpd.message };
    return { ok: true };
  }

  let staffName = opts.staffName ?? null;
  if (!staffName) {
    const { data: staffRow } = await db
      .from('staff').select('display_name').eq('id', staffId).maybeSingle();
    staffName = (staffRow as { display_name: string | null } | null)?.display_name ?? null;
  }
  const { error: eIns } = await db.from('mappa_piani_operatori').insert({
    piano_id: pianoId,
    staff_id: staffId,
    staff_name: staffName ?? staffId,
    colore: '#2563EB',
    km: 0,
    task_count: tasksAcea.length,
    start_address: null,
    tasks: tasksAcea,
    polyline: [],
  });
  if (eIns) return { ok: false, error: eIns.message };
  return { ok: true };
}
