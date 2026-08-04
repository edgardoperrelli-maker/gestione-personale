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
// attraverso i piani; se non c'è lo si crea sul piano VERO della commessa — quello di
// (data, territorio) scelto da `scegliPianoCommessa` — dove questo motore ha già registrato
// l'operatore in `mappa_piani_operatori` e agganciato gli interventi (passo di ADOZIONE, §2b).
// Il risultato è indistinguibile da un piano del percorso Excel: la vista pianifica lo mostra,
// e i rapportini non sono mai "orfani" (staff sempre fra gli operatori del loro piano).
//
// Cosa NON fa, di proposito:
//  - non cancella mai una voce, di nessuna origine;
//  - non tocca un rapportino già `inviato` senza una conferma esplicita dell'admin.
//
// NOTA STORICA (fino ad agosto 2026): questo motore NON scriveva `piano_id` sugli interventi e
// creava i rapportini su un piano-contenitore senza operatori né task, per paura che
// `ensureInterventiForPiano` — che ricostruisce gli interventi dai task del piano — cancellasse
// tutto ciò che nei task non trovava. Quel pericolo non esiste più dalla migration
// 20260603030000: la rigenerazione elimina SOLO le righe `created_from_mappa=true`
// (planInterventiForPiano) e le voci `origine='task'`, e gli interventi del registro nascono
// `false` per default di colonna. Il guscio invece i danni li faceva davvero: vista pianifica
// vuota, e rapportini a rischio orfani quando il "contenitore" riusato era un piano Excel vero.

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { risolviFlussoPerGruppo } from '@/lib/rapportini/flussiGruppo';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { PROFILO_COMMESSA, type Famiglia } from '@/lib/acea/famiglia';
import {
  scegliRapportino, taskIdAcea, vociDaAggiungere,
  type EsitoOperatore, type InterventoDaVoce, type VoceEsistente,
} from '@/lib/acea/vociRapportino';
import {
  caricaContestoPiani, creaPianoCommessa, eNotaContenitore,
  risolviTerritorioIdCommessa, scegliPianoCommessa, sincronizzaOperatorePiano,
} from '@/lib/acea/pianoCommessa';

export type OpzioniAcea = {
  /** Giorno di lavoro, 'YYYY-MM-DD'. */
  data: string;
  /** Utente che esegue: `mappa_piani.created_by` è NOT NULL. */
  attoreId: string;
  /** Limita a questi operatori (default: tutti quelli con interventi della commessa quel giorno). */
  staffIds?: string[];
  /** Riapre i rapportini già inviati che devono ricevere voci nuove. */
  confermaRiaperture?: boolean;
  /** Genera comunque, pur essendoci righe pianificate a metà per quel giorno. */
  confermaIncomplete?: boolean;
  /** Modello dei rapportini creati da zero. Sui rapportini esistenti non si tocca nulla. */
  templateId?: string;
  /**
   * La famiglia della vista che genera: decide registro, committenti e territorio-contenitore
   * (vedi `PROFILO_COMMESSA`). Assente = dunning, cioè la commessa ACEA storica — le due famiglie
   * ACEA condividono lo stesso profilo, quindi per loro il valore è indifferente.
   */
  famiglia?: Famiglia;
};

export type RisultatoAcea =
  | { ok: true; esiti: EsitoOperatore[]; avvisi: string[] }
  | {
      ok: false; status: number; error: string;
      /** ODL pianificati a metà per quel giorno: presenti solo sul rifiuto 409. */
      incomplete?: string[];
    };

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
  /** Serve all'adozione: regola 1 di `scegliPianoCommessa` (il piano del rapportino vince). */
  piano_id: string | null;
};

/** L'intervento con l'aggancio al piano: le due colonne che l'adozione backfilla se NULL. */
type InterventoConPiano = InterventoDaVoce & {
  piano_id: string | null;
  territorio_id: string | null;
};

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function sincronizzaRapportiniAcea(
  db: SupabaseClient,
  opts: OpzioniAcea,
): Promise<RisultatoAcea> {
  if (!RE_DATA.test(opts.data)) {
    return { ok: false, status: 400, error: 'Data non valida (atteso YYYY-MM-DD).' };
  }
  const profilo = PROFILO_COMMESSA[opts.famiglia ?? 'dunning'];
  const avvisi: string[] = [];

  /*
    ---- 0. Le righe pianificate a METÀ di questo giorno ---------------------------------------

    Una riga con la data ma senza esecutore (o viceversa) non è un intervento: `interventi.data` è
    NOT NULL e senza `staff_id` non c'è nessuno a cui mandare il rapportino. Quindi non produce
    nessuna voce, e non produrla è **silenzioso** — è esattamente il modo in cui un ordine sparisce
    dalla giornata di qualcuno senza che nessuno se ne accorga.

    Per questo si BLOCCA invece di avvisare: generare i rapportini è il momento in cui la
    pianificazione diventa lavoro vero, ed è l'ultimo istante utile per accorgersene. Con
    `confermaIncomplete` si va avanti lo stesso — la decisione resta all'ufficio, ma presa.

    MA il blocco vale solo per la generazione dell'INTERA giornata (senza `staffIds`). Quando si
    genera dalla selezione — l'ufficio ha scelto delle righe e un operatore — una bozza con la
    data e senza esecutore non può appartenere a nessuno degli operatori chiesti (un esecutore non
    ce l'ha proprio): bloccare lì significa fermare un'assegnazione completa per un ordine che
    NON è nella selezione, e chi guarda una griglia filtrata non può nemmeno capire quale sia
    (caso 12383864/12383202). Sulla mirata la riga a metà si dice negli avvisi, non nel cancello.

    Si guardano solo le righe con la DATA di questo giorno: quelle con il solo esecutore non
    appartengono a nessun giorno e non possono bloccarne uno: si contano e si dicono, in fondo.
  */
  const generazioneMirata = (opts.staffIds?.length ?? 0) > 0;
  if (!opts.confermaIncomplete && generazioneMirata) {
    const { data: aMeta } = await db
      .from(profilo.tabellaOrdini)
      .select('odl, pianificato_a_bozza')
      .eq('pianificato_il_bozza', opts.data);
    const incomplete = ((aMeta ?? []) as Array<{ odl: string; pianificato_a_bozza: string | null }>)
      .filter((r) => !r.pianificato_a_bozza)
      .map((r) => r.odl);
    if (incomplete.length > 0) {
      avvisi.push(
        incomplete.length === 1
          ? `L'ordine ${incomplete[0]} è programmato per questo giorno ma non ha un esecutore: resta fuori da ogni rapportino.`
          : `${incomplete.length} ordini (${incomplete.slice(0, 5).join(', ')}${incomplete.length > 5 ? ', …' : ''}) sono programmati per questo giorno senza esecutore: restano fuori da ogni rapportino.`,
      );
    }
  }
  if (!opts.confermaIncomplete && !generazioneMirata) {
    const { data: aMeta, error: eMeta } = await db
      .from(profilo.tabellaOrdini)
      .select('odl, pianificato_a_bozza')
      .eq('pianificato_il_bozza', opts.data);
    // Errore di lettura (tipicamente: migration non ancora passata) → si genera come prima, senza
    // il blocco. Un cancello che non si sa aprire non deve chiudere la strada a tutti.
    if (eMeta) console.error('[acea/rapportini] righe a meta` non lette:', eMeta.message);
    const incomplete = ((aMeta ?? []) as Array<{ odl: string; pianificato_a_bozza: string | null }>)
      .filter((r) => !r.pianificato_a_bozza)
      .map((r) => r.odl);
    if (incomplete.length > 0) {
      return {
        ok: false,
        status: 409,
        error: incomplete.length === 1
          ? '1 ordine è programmato per questo giorno ma non ha un esecutore: non entrerebbe in nessun rapportino.'
          : `${incomplete.length} ordini sono programmati per questo giorno ma non hanno un esecutore: non entrerebbero in nessun rapportino.`,
        incomplete,
      };
    }
  }

  // ---- 1. Interventi della commessa del giorno ------------------------------------------------
  const { data: intRows, error: eInt } = await db
    .from('interventi')
    .select(
      'id, odl, staff_id, stato, intervento_tipo, gruppo_attivita, committente, indirizzo, comune, cap, matricola_contatore, nominativo, pdr, recapito, piano_id, territorio_id',
    )
    .eq('data', opts.data)
    .in('committente', [...profilo.committenti]);
  if (eInt) return { ok: false, status: 500, error: eInt.message };

  const filtroStaff = opts.staffIds?.length ? new Set(opts.staffIds) : null;
  const interventi: InterventoConPiano[] = [];
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
      recapito: (r.recapito as string | null) ?? null,
      piano_id: (r.piano_id as string | null) ?? null,
      territorio_id: (r.territorio_id as string | null) ?? null,
    });
  }
  if (senzaOperatore > 0) {
    avvisi.push(`${senzaOperatore} interventi del giorno non hanno un esecutore: non generano voci.`);
  }

  /*
    Gli ordini con il solo ESECUTORE non appartengono a nessun giorno, quindi non possono bloccarne
    uno — ma sono lavoro deciso a metà, e sparirebbero senza che nessuno lo dica. Si contano una
    volta per generazione, come avviso.
  */
  const { data: senzaData } = await db
    .from(profilo.tabellaOrdini)
    .select('odl')
    .not('pianificato_a_bozza', 'is', null)
    .is('pianificato_il_bozza', null);
  const inSospeso = ((senzaData ?? []) as Array<{ odl: string }>).length;
  if (inSospeso > 0) {
    avvisi.push(
      `${inSospeso} ordini hanno un esecutore ma nessun giorno: restano fuori da qualunque rapportino finché non hanno una data.`,
    );
  }

  if (interventi.length === 0) return { ok: true, esiti: [], avvisi };

  const perStaff = new Map<string, InterventoConPiano[]>();
  for (const i of interventi) {
    perStaff.set(i.staff_id, [...(perStaff.get(i.staff_id) ?? []), i]);
  }
  const staffIds = [...perStaff.keys()];

  // ---- 2. Rapportini esistenti del giorno, su qualunque piano --------------------------------
  const { data: rapRows, error: eRap } = await db
    .from('rapportini')
    .select('id, staff_id, staff_name, stato, token, created_at, piano_id')
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
      .select('rapportino_id, task_id, intervento_id, odl, ordine, origine, matricola')
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
          matricola: (v.matricola as string | null) ?? null,
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

  /*
    ---- 5b. ADOZIONE: il piano vero della commessa, operatore per operatore -------------------

    È il passo che rende il risultato indistinguibile dal percorso Excel, e gira per OGNI
    operatore con interventi del giorno — anche a esito `nessuna_modifica`: sana i contenitori
    storici e i piani rimasti a metà. Le tre scritture sono un blocco unico per costruzione:

      1. `piano_id` (+`territorio_id`) sugli interventi che l'hanno NULL — mai spostati se già
         agganciati altrove;
      2. la riga operatore in `mappa_piani_operatori` con i task `acea:*` — OBBLIGATORIA
         insieme al punto 1: un rapportino su un piano senza la propria riga operatore viene
         eliminato da `orphanRapportini` alla prima rigenerazione (l'incidente PASTORELLI);
      3. la nota-sentinella «Contenitore…» azzerata sul piano adottato.

    I rapportini esistenti NON si spostano mai (stesso id/token): è il piano a convergere su
    di loro (regola 1 di `scegliPianoCommessa`), non il contrario.
  */
  const contesto = await caricaContestoPiani(db, opts.data, profilo.territorioPiani);
  if (!contesto.ok) return { ok: false, status: 500, error: contesto.error };
  const { piani, operatoriPerPiano } = contesto;
  const territorioId = await risolviTerritorioIdCommessa(db, profilo.territorioPiani);
  const pianoPerStaff = new Map<string, string>();
  for (const staffId of staffIds) {
    const miei = perStaff.get(staffId) ?? [];
    const pianiIds = new Set(piani.map((p) => p.id));
    const pianiConRapportino = new Set(
      rapportini
        .filter((r) => r.staff_id === staffId && r.piano_id && pianiIds.has(r.piano_id))
        .map((r) => String(r.piano_id)),
    );
    const pianiConRiga = new Set(
      piani.filter((p) => operatoriPerPiano.get(p.id)?.has(staffId)).map((p) => p.id),
    );
    let pianoId = scegliPianoCommessa(piani, pianiConRapportino, pianiConRiga);
    if (!pianoId) {
      const c = await creaPianoCommessa(db, opts.data, profilo.territorioPiani, opts.attoreId);
      if (!c.ok) return { ok: false, status: 500, error: c.error };
      pianoId = c.pianoId;
      // Visibile agli operatori successivi dello stesso giro: un solo piano, come prima.
      piani.push({ id: pianoId, created_at: null, note: null });
    } else {
      const p = piani.find((x) => x.id === pianoId);
      if (p && eNotaContenitore(p.note)) {
        await db.from('mappa_piani').update({ note: null }).eq('id', pianoId);
        p.note = null;
      }
    }
    pianoPerStaff.set(staffId, pianoId);

    // Backfill SOLO dei NULL: un intervento già agganciato (o con territorio da override)
    // non si tocca — l'adozione ripara, non riorganizza.
    const senzaPiano = miei.filter((i) => i.piano_id == null).map((i) => i.id);
    if (senzaPiano.length > 0) {
      const { error: eUp } = await db
        .from('interventi').update({ piano_id: pianoId }).in('id', senzaPiano);
      if (eUp) return { ok: false, status: 500, error: eUp.message };
    }
    if (territorioId) {
      const senzaTerritorio = miei.filter((i) => i.territorio_id == null).map((i) => i.id);
      if (senzaTerritorio.length > 0) {
        const { error: eUp } = await db
          .from('interventi').update({ territorio_id: territorioId }).in('id', senzaTerritorio);
        if (eUp) return { ok: false, status: 500, error: eUp.message };
      }
    }

    const sync = await sincronizzaOperatorePiano(db, pianoId, staffId, {
      staffName: nomi.get(staffId) ?? null,
    });
    // Bloccante: interventi col piano ma senza riga operatore sono la combinazione che
    // l'adozione esiste per impedire (vedi commento sopra, punto 2).
    if (!sync.ok) return { ok: false, status: 500, error: sync.error };
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const esiti: EsitoOperatore[] = [];

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
      // Per acqualatina l'unità è il contatore: cinque matricole dello stesso ODL sono cinque
      // voci, non quattro «già presenti».
      profilo.unita,
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
      // Il piano dell'operatore è già pronto (adozione §5b): riga operatore inclusa, quindi
      // il rapportino che nasce qui non può diventare orfano.
      const pianoOperatore = pianoPerStaff.get(staffId);
      if (!pianoOperatore) {
        return { ok: false, status: 500, error: 'Piano della commessa non risolto per l’operatore.' };
      }
      token = randomBytes(24).toString('base64url');
      const { data: ins, error } = await db
        .from('rapportini')
        .insert({
          piano_id: pianoOperatore, staff_id: staffId, staff_name: nome, data: opts.data,
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
    /*
      Le note dell'ufficio scritte sul registro, per gli ODL che stanno entrando nel rapportino.

      È l'aggancio fra la colonna «Note» della tabella e il banner «Nota dall'ufficio» che
      l'operatore si trova in cima alla card: la nota viaggia dentro `raw_json.note`, che è dove
      `notaUfficioFromRaw` la va a cercare. Nessun motore nuovo — quello esisteva già, mancava
      solo chi ci scrivesse dentro.
    */
    const notePerOdl = new Map<string, string>();
    const odlDaAggiungere = [...new Set(daAggiungere.map((i) => i.odl).filter(Boolean))] as string[];
    for (let i = 0; i < odlDaAggiungere.length; i += 200) {
      const { data: conNota } = await db
        .from(profilo.tabellaOrdini)
        .select('odl, note')
        .in('odl', odlDaAggiungere.slice(i, i + 200));
      for (const r of (conNota ?? []) as Array<{ odl: string; note: string | null }>) {
        if (r.note && r.note.trim() !== '') notePerOdl.set(r.odl, r.note);
      }
    }

    const righe = daAggiungere.map((i, k) => {
      const f = flussoPerIntervento(i);
      const nota = i.odl ? notePerOdl.get(i.odl) : undefined;
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
        // Il RECAPITO è fra i campi info di default del rapportino da sempre, ma sul percorso
        // registro non aveva un canale: sul percorso mappa viaggia col Task fino alla voce,
        // qui passa da `interventi.recapito` (colonna nata il 2026-08-02).
        recapito: i.recapito ?? null,
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
          // `note` e non un nome nostro: e` la chiave che `notaUfficioFromRaw` legge, la stessa
          // che usano gli altri committenti. Cambiarla avrebbe voluto dire un secondo motore.
          ...(nota ? { note: nota } : {}),
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
