// lib/acea/sincronizzaRapportiniAcea.ts
// Motore rapportini della commessa ACEA — SEPARATO da `sincronizzaRapportini` (il motore dei
// piani Mappa) e con una filosofia opposta.
//
// Il motore dei piani POSSIEDE il rapportino: a ogni rigenerazione cancella le proprie voci e le
// riscrive dai task. Questo qui non possiede niente. Arriva su un rapportino che qualcun altro ha
// creato — tipicamente la pianificazione Italgas, fatta a mano prima — e vi AGGIUNGE le voci
// della commessa marcandole `origine='acea'`, che è esattamente la colonna che impedisce all'altro
// motore di raderle via al giro successivo.
//
// Regola unica: **un rapportino per operatore per giorno**. Si cerca per `(staff_id, data)`,
// attraverso i piani; se non c'è lo si crea su un piano-contenitore di territorio ACEA,
// indipendentemente dall'attività.
//
// Cosa NON fa, di proposito:
//  - non cancella mai una voce, di nessuna origine;
//  - non tocca un rapportino già `inviato` senza una conferma esplicita dell'admin;
//  - non scrive `piano_id` sugli interventi ACEA. Sono senza piano per costruzione: legarli al
//    piano-contenitore li esporrebbe a `ensureInterventiForPiano`, che ricostruisce gli interventi
//    dai task del piano e cancellerebbe tutto ciò che nei task non trova — e nel contenitore di
//    task non ce ne sono.

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { risolviFlussoPerGruppo } from '@/lib/rapportini/flussiGruppo';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import {
  COMMITTENTI_ACEA, TERRITORIO_ACEA, scegliRapportino, taskIdAcea, vociDaAggiungere,
  type EsitoOperatore, type InterventoDaVoce, type VoceEsistente,
} from '@/lib/acea/vociRapportino';

export type OpzioniAcea = {
  /** Giorno di lavoro, 'YYYY-MM-DD'. */
  data: string;
  /** Utente che esegue: `mappa_piani.created_by` è NOT NULL. */
  attoreId: string;
  /** Limita a questi operatori (default: tutti quelli con interventi ACEA quel giorno). */
  staffIds?: string[];
  /** Riapre i rapportini già inviati che devono ricevere voci nuove. */
  confermaRiaperture?: boolean;
  /** Modello dei rapportini creati da zero. Sui rapportini esistenti non si tocca nulla. */
  templateId?: string;
};

export type RisultatoAcea =
  | { ok: true; esiti: EsitoOperatore[]; avvisi: string[] }
  | { ok: false; status: number; error: string };

type TemplateRow = {
  id: string;
  nome: string | null;
  campi: unknown;
  info_campi?: unknown;
  tipo: string | null;
  solo_manuale: boolean | null;
  gruppo_committente?: string | null;
  gruppi_attivita?: string[] | null;
};

type RapportinoRow = {
  id: string; staff_id: string; staff_name: string | null;
  stato: string; token: string; created_at: string | null;
};

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function sincronizzaRapportiniAcea(
  db: SupabaseClient,
  opts: OpzioniAcea,
): Promise<RisultatoAcea> {
  if (!RE_DATA.test(opts.data)) {
    return { ok: false, status: 400, error: 'Data non valida (atteso YYYY-MM-DD).' };
  }
  const avvisi: string[] = [];

  // ---- 1. Interventi ACEA del giorno ---------------------------------------------------------
  const { data: intRows, error: eInt } = await db
    .from('interventi')
    .select(
      'id, odl, staff_id, stato, intervento_tipo, gruppo_attivita, committente, indirizzo, comune, cap, matricola_contatore, nominativo, pdr',
    )
    .eq('data', opts.data)
    .in('committente', [...COMMITTENTI_ACEA]);
  if (eInt) return { ok: false, status: 500, error: eInt.message };

  const filtroStaff = opts.staffIds?.length ? new Set(opts.staffIds) : null;
  const interventi: InterventoDaVoce[] = [];
  let senzaOperatore = 0;
  for (const r of (intRows ?? []) as Array<Record<string, unknown>>) {
    const staffId = String(r.staff_id ?? '').trim();
    if (String(r.stato ?? '') === 'annullato') continue;
    if (!staffId) { senzaOperatore++; continue; }
    if (filtroStaff && !filtroStaff.has(staffId)) continue;
    interventi.push({
      id: String(r.id),
      odl: (r.odl as string | null) ?? null,
      staff_id: staffId,
      intervento_tipo: (r.intervento_tipo as string | null) ?? null,
      gruppo_attivita: (r.gruppo_attivita as string | null) ?? null,
      committente: (r.committente as string | null) ?? null,
      indirizzo: (r.indirizzo as string | null) ?? null,
      comune: (r.comune as string | null) ?? null,
      cap: (r.cap as string | null) ?? null,
      matricola_contatore: (r.matricola_contatore as string | null) ?? null,
      nominativo: (r.nominativo as string | null) ?? null,
      pdr: (r.pdr as string | null) ?? null,
    });
  }
  if (senzaOperatore > 0) {
    avvisi.push(`${senzaOperatore} interventi del giorno non hanno un esecutore: non generano voci.`);
  }
  if (interventi.length === 0) return { ok: true, esiti: [], avvisi };

  const perStaff = new Map<string, InterventoDaVoce[]>();
  for (const i of interventi) {
    perStaff.set(i.staff_id, [...(perStaff.get(i.staff_id) ?? []), i]);
  }
  const staffIds = [...perStaff.keys()];

  // ---- 2. Rapportini esistenti del giorno, su qualunque piano --------------------------------
  const { data: rapRows, error: eRap } = await db
    .from('rapportini')
    .select('id, staff_id, staff_name, stato, token, created_at')
    .eq('data', opts.data)
    .in('staff_id', staffIds);
  if (eRap) return { ok: false, status: 500, error: eRap.message };
  const rapportini = (rapRows ?? []) as RapportinoRow[];

  // ---- 3. Voci già presenti su quei rapportini ------------------------------------------------
  const vociPerRapportino = new Map<string, VoceEsistente[]>();
  const conVociAcea = new Set<string>();
  if (rapportini.length > 0) {
    const { data: vociRows, error: eVoci } = await db
      .from('rapportino_voci')
      .select('rapportino_id, task_id, intervento_id, odl, ordine, origine')
      .in('rapportino_id', rapportini.map((r) => r.id));
    // `origine` è il perno di tutto il meccanismo: senza quella colonna le voci ACEA verrebbero
    // cancellate dal motore dei piani alla prima rigenerazione. Meglio fermarsi che scriverle.
    if (eVoci) {
      return /origine/i.test(eVoci.message) && /column|schema/i.test(eVoci.message)
        ? { ok: false, status: 503, error: 'Migration 20260727091000 (rapportino_voci.origine) non applicata: il motore ACEA non può scrivere voci che il motore dei piani cancellerebbe.' }
        : { ok: false, status: 500, error: eVoci.message };
    }
    for (const v of (vociRows ?? []) as Array<Record<string, unknown>>) {
      const rid = String(v.rapportino_id);
      vociPerRapportino.set(rid, [
        ...(vociPerRapportino.get(rid) ?? []),
        {
          task_id: (v.task_id as string | null) ?? null,
          intervento_id: (v.intervento_id as string | null) ?? null,
          odl: (v.odl as string | null) ?? null,
          ordine: typeof v.ordine === 'number' ? v.ordine : null,
        },
      ]);
      if (v.origine === 'acea') conVociAcea.add(rid);
    }
  }

  // ---- 4. Flussi per-voce e modello di base ---------------------------------------------------
  // Stessa resilienza del motore dei piani: se le colonne di collegamento non ci sono, si resta
  // senza flussi per-voce e le voci ereditano lo snapshot del rapportino.
  let templates: TemplateRow[] = [];
  const qTpl = await db
    .from('rapportino_template')
    .select('id, nome, campi, info_campi, tipo, solo_manuale, gruppo_committente, gruppi_attivita')
    .eq('active', true);
  if (!qTpl.error) {
    templates = (qTpl.data ?? []) as TemplateRow[];
  } else {
    const qBase = await db
      .from('rapportino_template')
      .select('id, nome, campi, info_campi, tipo, solo_manuale')
      .eq('active', true);
    templates = qBase.error ? [] : ((qBase.data ?? []) as unknown as TemplateRow[]);
  }
  const flussi = templates.filter((t) => Boolean(t.gruppo_committente));

  const flussoPerIntervento = (i: InterventoDaVoce): TemplateRow | null => {
    if (flussi.length === 0) return null;
    const f = risolviFlussoPerGruppo(committenteEquivalente(i.committente), i.gruppo_attivita, flussi);
    if (!f || !Array.isArray(f.campi) || f.campi.length === 0) return null;
    return f;
  };

  // Modello del rapportino creato da zero: quello indicato, altrimenti il flusso ACEA più
  // ricorrente del giorno (così il rapportino nasce già con le azioni giuste), altrimenti il primo
  // attivo non-manuale in ordine di nome — deterministico.
  const risolviTemplateBase = (miei: InterventoDaVoce[]): TemplateRow | null => {
    if (opts.templateId) return templates.find((t) => t.id === opts.templateId) ?? null;
    const conteggi = new Map<string, number>();
    for (const i of miei) {
      const f = flussoPerIntervento(i);
      if (f) conteggi.set(f.id, (conteggi.get(f.id) ?? 0) + 1);
    }
    const vincente = [...conteggi.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    if (vincente) return templates.find((t) => t.id === vincente[0]) ?? null;
    return (
      templates
        .filter((t) => !t.solo_manuale)
        .sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'it'))[0] ?? null
    );
  };

  // ---- 5. Nomi operatore ----------------------------------------------------------------------
  const nomi = new Map<string, string | null>();
  for (const r of rapportini) if (r.staff_name) nomi.set(r.staff_id, r.staff_name);
  const mancanti = staffIds.filter((s) => !nomi.has(s));
  if (mancanti.length > 0) {
    const { data: staffRows } = await db.from('staff').select('id, display_name').in('id', mancanti);
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      nomi.set(String(s.id), s.display_name ?? null);
    }
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const esiti: EsitoOperatore[] = [];
  let pianoAcea: string | null = null;   // creato pigramente: solo se serve davvero

  // ---- 6. Un operatore alla volta -------------------------------------------------------------
  for (const staffId of staffIds) {
    const miei = perStaff.get(staffId) ?? [];
    const nome = nomi.get(staffId) ?? null;
    const suoi = rapportini
      .filter((r) => r.staff_id === staffId)
      .map((r) => ({ id: r.id, stato: r.stato, created_at: r.created_at, conVociAcea: conVociAcea.has(r.id) }));
    const scelto = scegliRapportino(suoi);
    const rapRow = scelto ? rapportini.find((r) => r.id === scelto.id) ?? null : null;

    const { daAggiungere, giaPresenti, ordineIniziale } = vociDaAggiungere(
      miei,
      scelto ? (vociPerRapportino.get(scelto.id) ?? []) : [],
    );

    const base = {
      staff_id: staffId, staff_name: nome,
      interventi: miei.length, voci_aggiunte: 0, voci_gia_presenti: giaPresenti,
    };

    // Niente da aggiungere: si dice comunque, anche (soprattutto) se il rapportino è inviato —
    // pretendere una riapertura per zero voci sarebbe rumore.
    if (daAggiungere.length === 0 && rapRow) {
      esiti.push({
        ...base, esito: 'nessuna_modifica',
        rapportino_id: rapRow.id, url: `${baseUrl}/r/${rapRow.token}`,
      });
      continue;
    }

    // Rapportino consegnato: non si altera in silenzio. È il difetto che questo motore non
    // ripete — `skipInviati` nel motore dei piani scarta il lavoro senza avvisare nessuno.
    if (rapRow && rapRow.stato === 'inviato' && !opts.confermaRiaperture) {
      esiti.push({
        ...base, esito: 'richiede_riapertura',
        rapportino_id: rapRow.id, url: `${baseUrl}/r/${rapRow.token}`,
      });
      continue;
    }

    let rapportinoId: string;
    let token: string;
    let creato = false;

    if (rapRow) {
      rapportinoId = rapRow.id;
      token = rapRow.token;
      if (rapRow.stato === 'inviato') {
        const { error } = await db
          .from('rapportini')
          .update({ stato: 'in_corso', riaperto_at: new Date().toISOString() })
          .eq('id', rapportinoId);
        if (error) return { ok: false, status: 500, error: error.message };
      }
    } else {
      const tpl = risolviTemplateBase(miei);
      if (!tpl) {
        return {
          ok: false, status: 422,
          error: 'Nessun flusso attivo in Azioni operatori: impossibile creare i rapportini ACEA.',
        };
      }
      if (!pianoAcea) {
        const p = await assicuraPianoAcea(db, opts.data, opts.attoreId);
        if (!p.ok) return p;
        pianoAcea = p.pianoId;
      }
      token = randomBytes(24).toString('base64url');
      const { data: ins, error } = await db
        .from('rapportini')
        .insert({
          piano_id: pianoAcea, staff_id: staffId, staff_name: nome, data: opts.data,
          template_id: tpl.id, campi_snapshot: tpl.campi ?? [], info_snapshot: tpl.info_campi ?? [],
          tipo: tpl.tipo ?? 'standard', token, stato: 'in_corso', expires_at: scadenzaIso(opts.data),
        })
        .select('id')
        .single();
      if (error || !ins) {
        return { ok: false, status: 500, error: error?.message ?? 'Creazione rapportino fallita.' };
      }
      rapportinoId = String((ins as { id: string }).id);
      creato = true;
    }

    // `_nuovo` accende l'evidenza nella pagina dell'operatore: una voce comparsa su un rapportino
    // che aveva già in mano non deve passare inosservata.
    const righe = daAggiungere.map((i, k) => {
      const f = flussoPerIntervento(i);
      return {
        rapportino_id: rapportinoId,
        intervento_id: i.id,
        task_id: taskIdAcea(i.id),
        ordine: ordineIniziale + k,
        origine: 'acea',
        manuale: false,
        odl: i.odl,
        matricola: i.matricola_contatore,
        pdr: i.pdr,
        nominativo: i.nominativo,
        via: i.indirizzo,
        comune: i.comune,
        cap: i.cap,
        attivita: i.intervento_tipo,
        risposte: {},
        raw_json: {
          _acea: true,
          _nuovo: !creato,
          odl: i.odl,
          gruppo_attivita: i.gruppo_attivita,
          committente: i.committente,
        },
        ...(flussi.length > 0
          ? { template_id: f?.id ?? null, campi_snapshot: (f?.campi as TemplateCampo[] | undefined) ?? null }
          : {}),
      };
    });

    let { error: eIns } = await db.from('rapportino_voci').insert(righe);
    // Migration del flusso per-voce non applicata: si riprova senza quelle colonne, come fa il
    // motore dei piani. Le voci restano valide, ereditano lo snapshot del rapportino.
    if (eIns && /template_id|campi_snapshot/i.test(eIns.message) && /column|schema/i.test(eIns.message)) {
      ({ error: eIns } = await db.from('rapportino_voci').insert(
        righe.map((r) => {
          const rest = { ...(r as Record<string, unknown>) };
          delete rest.template_id;
          delete rest.campi_snapshot;
          return rest;
        }),
      ));
    }
    if (eIns) return { ok: false, status: 500, error: eIns.message };

    esiti.push({
      ...base,
      esito: creato ? 'creato' : 'aggiunto',
      rapportino_id: rapportinoId,
      url: `${baseUrl}/r/${token}`,
      voci_aggiunte: righe.length,
    });
  }

  return { ok: true, esiti, avvisi };
}

/**
 * Piano-contenitore del giorno, territorio ACEA.
 *
 * Esiste solo perché `rapportini.piano_id` è NOT NULL. Non ha operatori né task: è un guscio, e
 * deve restare tale — un piano con operatori sarebbe rigenerabile dalla Mappa, e la rigenerazione
 * possiede voci che qui non sono sue. Si riusa quello del giorno se c'è già.
 */
async function assicuraPianoAcea(
  db: SupabaseClient,
  data: string,
  attoreId: string,
): Promise<{ ok: true; pianoId: string } | { ok: false; status: number; error: string }> {
  const { data: esistenti, error: eSel } = await db
    .from('mappa_piani')
    .select('id')
    .eq('data', data)
    .eq('territorio', TERRITORIO_ACEA);
  if (eSel) return { ok: false, status: 500, error: eSel.message };
  const primo = (esistenti ?? [])[0] as { id: string } | undefined;
  if (primo) return { ok: true, pianoId: String(primo.id) };

  const { data: ins, error } = await db
    .from('mappa_piani')
    .insert({
      data, territorio: TERRITORIO_ACEA, note: 'Contenitore dei rapportini della commessa ACEA.',
      stato: 'confermato', created_by: attoreId, updated_by: attoreId,
    })
    .select('id')
    .single();
  if (error || !ins) {
    return { ok: false, status: 500, error: error?.message ?? 'Creazione piano ACEA fallita.' };
  }
  return { ok: true, pianoId: String((ins as { id: string }).id) };
}
