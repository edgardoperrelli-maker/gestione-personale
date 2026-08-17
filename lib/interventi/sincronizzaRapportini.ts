// lib/interventi/sincronizzaRapportini.ts
// Motore di (ri)generazione dei rapportini di un piano, condiviso tra il pulsante
// "Genera" e il Salva della pianificazione. Estratto da genera/route.ts.
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { taskToVoce, mergeVoci, type Voce } from '@/utils/rapportini/buildVoci';
import { rankOrdineDaFile } from '@/utils/rapportini/ordineVoci';
import { orphanRapportini } from '@/utils/rapportini/orphans';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import { rilevaConflitti, type RapEsistente } from '@/utils/rapportini/rilevaConflitti';
import { dettagliOdlBloccati, normOdl, taskDaSaltare, type OdlBloccatoDettaglio } from '@/lib/interventi/odlPositivi';
import { filtraTaskRendicontati, tuttiTaskRendicontatiAltrove, type VoceAltrui } from '@/lib/interventi/taskRendicontati';
import type { PositivoDettaglio } from '@/lib/interventi/caricaOdlPositivi';
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import { risolviFlussoPerGruppo } from '@/lib/rapportini/flussiGruppo';
import { risolviFlussoDaTask, type TaskClassificabile } from '@/lib/rapportini/flussoDaTask';
import { buildTassonomiaIndex, committenteEquivalente, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { flussoPrevalente } from '@/lib/interventi/templateOperatore';
import { pickTemplateId } from '@/lib/interventi/templatePiano';
import { pianoHaRisanamento, risolviTemplateRisanamento } from '@/lib/risanamento/templateRisanamento';
import { registraAzione, type AttoreAudit } from '@/lib/audit/registra';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type SincronizzaOpts = {
  /**
   * Modello esplicito (flussi con template configurato, es. agente): vale per tutti gli
   * operatori del piano. Se assente il motore risolve PER OPERATORE: modello già stabilito
   * dal suo rapportino esistente → risanamento (suoi task RESINE) → flusso prevalente fra i
   * SUOI task → prevalente del piano. Con le Azioni operatori la mappa non chiede più la
   * scelta del modello; is_default è ritirato.
   */
  templateId?: string;
  overwrite?: 'replace' | 'skip';
  overwriteSubmitted?: boolean;
  /** Conferma la riapertura dei rapportini INVIATI di questo stesso piano toccati dalla variazione. */
  confermaInviati?: boolean;
  /**
   * Salta del tutto i rapportini già INVIATI: non ne ricostruisce le voci e non ne tocca lo stato.
   * Usato dal sync automatico al salvataggio del piano, dove un rapportino consegnato non va alterato
   * senza una conferma esplicita (la riapertura resta competenza del flusso "Genera/Conferma").
   */
  skipInviati?: boolean;
  /**
   * Chi ha innescato il sync. Serve solo al registro (Impostazioni › Log): questo motore
   * cancella rapportini — gli orfani e, con overwrite:'replace', quelli in conflitto — e senza
   * un attore quelle sparizioni restano anonime. Facoltativo: i chiamanti che non lo passano
   * registrano comunque l'evento, con utenza vuota.
   */
  attore?: AttoreAudit;
};

export type SincronizzaResult =
  | {
      ok: true;
      rapportini: { staff_id: string; staff_name: string | null; token: string; url: string }[];
      interventiWarning?: string;
      /** odl del piano NON generati (né voce né intervento) perché già eseguiti positivi altrove. */
      odlBloccati?: string[];
      /** dettagli (data/esecutore del positivo originale) per i messaggi "già positivo il …". */
      odlBloccatiDettagli?: OdlBloccatoDettaglio[];
      /**
       * Task che non hanno saputo dire a quale flusso appartengono (né dall'intervento né
       * dalla tassonomia della loro attività): le loro voci nascono SENZA campi. Si segnala
       * invece di prestargli il modulo di un altro committente — vedi `flussoDaTask`.
       */
      taskSenzaFlusso?: string[];
    }
  | { ok: false; status: number; error?: string; conflicts?: unknown[] };

/** Riconosce la violazione FK su rapportino_voci.intervento_id (race: interventi ricreati da una generazione concorrente). */
export function isInterventoFkError(msg: string | null | undefined): boolean {
  return !!msg && /rapportino_voci_intervento_id_fkey/i.test(msg);
}

export async function sincronizzaRapportini(
  db: SupabaseClient,
  pianoId: string,
  opts: SincronizzaOpts,
): Promise<SincronizzaResult> {
  const { data: piano } = await db.from('mappa_piani').select('id, data, territorio').eq('id', pianoId).single();
  if (!piano) return { ok: false, status: 404, error: 'Piano non trovato' };
  const { data: ops } = await db.from('mappa_piani_operatori').select('staff_id, staff_name, tasks').eq('piano_id', pianoId);

  // Template attivi: servono sia per i flussi per-voce (collegamento al gruppo attività,
  // modulo Azioni operatori) sia per risolvere il fallback quando il modello non arriva dal
  // chiamante. Resiliente: se le colonne di collegamento non esistono ancora (migration non
  // applicata), si ripiega su una select senza collegamento (nessun flusso, solo fallback).
  type TemplateAttivoRow = {
    id: string; nome: string | null; campi: unknown; tipo: string | null;
    solo_manuale: boolean | null;
    gruppo_committente?: string | null; gruppi_attivita?: string[] | null;
  };
  let templatesAttivi: TemplateAttivoRow[] = [];
  const qTpl = await db
    .from('rapportino_template')
    .select('id, nome, campi, tipo, solo_manuale, gruppo_committente, gruppi_attivita')
    .eq('active', true);
  if (!qTpl.error) {
    templatesAttivi = (qTpl.data ?? []) as TemplateAttivoRow[];
  } else {
    const qBase = await db
      .from('rapportino_template')
      .select('id, nome, campi, tipo, solo_manuale')
      .eq('active', true);
    templatesAttivi = qBase.error ? [] : (((qBase.data ?? []) as unknown) as TemplateAttivoRow[]);
  }

  // Flussi collegati (committente + gruppo attività) e tassonomia: servono sia alla risoluzione
  // per-voce sia al fallback del rapportino, che da qui in poi NON è più una scelta arbitraria.
  const flussi = templatesAttivi.filter((f) => Boolean(f.gruppo_committente));
  const { data: tassRighe } = await db
    .from('attivita_tassonomia')
    .select('committente, descrizione, descrizione_norm, gruppo, attivo');
  const tassIndex = buildTassonomiaIndex(
    (((tassRighe ?? []) as Array<{ committente: string; descrizione: string; descrizione_norm: string; gruppo: string; attivo: boolean }>)
      .map((r) => ({
        committente: r.committente, descrizione: r.descrizione,
        descrizioneNorm: r.descrizione_norm, gruppo: r.gruppo, attivo: r.attivo,
      })) as TassonomiaRiga[]),
  );
  const tasksPiano = (ops ?? []).flatMap((o) => ((o.tasks as TaskClassificabile[]) ?? []));

  // Modello del rapportino (fallback per le voci senza flusso): esplicito dal chiamante, vale
  // per tutto il piano. SENZA esplicito la risoluzione è PER OPERATORE, dentro il loop più
  // sotto: il modello già stabilito dal SUO rapportino (riaperture: stesso modello, niente
  // churn di link) → risanamento se i SUOI task hanno RESINE → flusso prevalente fra i SUOI
  // task → prevalente del piano (operatore coi task non classificabili).
  //
  // Qui la scelta era UNA per l'intero piano, contata su tutti i task del giro. Sul piano
  // misto PERUGIA del 2026-08-17 (4 operatori BONIFICHE EXTRA, 3 Italgas) ha vinto il flusso
  // task-via — 27 task contro 25 — e i tre operatori Italgas si sono trovati la testata
  // `task_via = true`: ogni loro attività apriva il contenitore bonifica invece del form
  // esito. Il modello è dell'OPERATORE, non del piano: si conta sul suo lavoro. (In
  // `flussoPrevalente` resta anche la regola nata qui il 27/07/2026: niente eredità
  // alfabetica — o il modello lo dicono i task, o il rapportino nasce senza.)
  const templateEsplicito = opts.templateId ?? null;
  if (templateEsplicito) {
    const { data: tplRow } = await db.from('rapportino_template').select('id').eq('id', templateEsplicito).single();
    if (!tplRow) return { ok: false, status: 404, error: 'Template non trovato' };
  }
  const candidatiRisanamento = templatesAttivi
    .filter((t) => !t.solo_manuale)
    .map((t) => ({ id: t.id, nome: t.nome ?? '', tipo: t.tipo ?? undefined }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const prevalentePiano = flussoPrevalente(tasksPiano, tassIndex, flussi);
  // Azioni operatori davvero vuoto (nessun flusso collegato E nessun modello non-manuale) e
  // nessun modello già stabilito da un rapportino esistente del piano (sticky): non c'è
  // niente con cui compilare, né a livello di rapportino né di voce. Resta un errore.
  const { data: rapsPiano } = await db.from('rapportini').select('template_id').eq('piano_id', pianoId);
  const stickyPiano = pickTemplateId((rapsPiano as Array<{ template_id?: string | null }>) ?? []);
  if (!templateEsplicito && !stickyPiano && !prevalentePiano && flussi.length === 0 && templatesAttivi.every((t) => t.solo_manuale)) {
    return { ok: false, status: 422, error: 'Nessun flusso attivo in Azioni operatori: impossibile generare i rapportini.' };
  }
  // Nessun modello risolto per un operatore: il suo rapportino nasce senza modulo e le voci
  // (dal proprio flusso o dal "+") portano i campi. Meglio vuoto che con quello di un altro.
  type TplTestata = { campi: unknown; info_campi?: unknown; tipo?: string | null };
  const TPL_VUOTO: TplTestata = { campi: [], info_campi: [], tipo: 'standard' };
  const tplTestataCache = new Map<string, TplTestata | null>();
  // Un id risolto (sticky/prevalente) che non esiste più non è un errore fatale come
  // l'esplicito: null = quell'operatore resta senza modulo (e senza template_id, che
  // scritto punterebbe a una riga cancellata), gli altri generano comunque.
  const caricaTplTestata = async (id: string): Promise<TplTestata | null> => {
    if (tplTestataCache.has(id)) return tplTestataCache.get(id) ?? null;
    const { data: tplRow } = await db.from('rapportino_template').select('id, campi, info_campi, tipo').eq('id', id).maybeSingle();
    const tpl = (tplRow as TplTestata | null) ?? null;
    tplTestataCache.set(id, tpl);
    return tpl;
  };

  const operatoriPiano = (ops ?? []).map((o) => ({ staff_id: String(o.staff_id), staff_name: (o.staff_name as string | null) ?? null }));

  const { data: altriRaps, error: eAltri } = await db
    .from('rapportini').select('id, staff_id, piano_id, data, stato, submitted_at')
    .eq('data', piano.data).neq('piano_id', pianoId).in('staff_id', operatoriPiano.map((o) => o.staff_id));
  if (eAltri) return { ok: false, status: 500, error: eAltri.message };

  const altriPianoIds = [...new Set((altriRaps ?? []).map((r) => r.piano_id as string))];
  const terrByPiano: Record<string, string | null> = {};
  if (altriPianoIds.length) {
    const { data: altriPiani, error: ePiani } = await db.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
    if (ePiani) return { ok: false, status: 500, error: ePiani.message };
    (altriPiani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
  }
  const esistenti: RapEsistente[] = (altriRaps ?? []).map((r) => ({
    id: r.id as string, staff_id: String(r.staff_id), piano_id: r.piano_id as string,
    territorio: terrByPiano[r.piano_id as string] ?? null, data: r.data as string,
    stato: r.stato as string, submitted_at: (r.submitted_at as string | null) ?? null,
  }));

  /*
    G2 (guardia commessa) — i task `acea:*` già rendicontati in un ALTRO rapportino dello
    stesso operatore nello stesso giorno. È il caso dell'operatore "misto" (Italgas +
    commessa): il suo rapportino unico vive su un piano di un ALTRO territorio, quindi
    `rilevaConflitti` non scatta, e senza questa guardia il motore gliene creerebbe un
    secondo — rompendo la regola «un rapportino per operatore per giorno» del motore acea.
    Ristretta al prefisso `acea:` (id globalmente deterministici); i task Excel `row-N` non
    sono unici fra piani e non possono partecipare.
  */
  const staffByAltroRap = new Map((altriRaps ?? []).map((r) => [String(r.id), String(r.staff_id)]));
  const taskAceaAltrove = new Map<string, Set<string>>();
  if ((altriRaps ?? []).length > 0) {
    const { data: vociAltriRaps } = await db
      .from('rapportino_voci')
      .select('rapportino_id, task_id')
      .in('rapportino_id', (altriRaps ?? []).map((r) => r.id));
    for (const v of (vociAltriRaps ?? []) as Array<{ rapportino_id: string; task_id: string | null }>) {
      const tid = String(v.task_id ?? '');
      if (!tid.startsWith('acea:')) continue;
      const sid = staffByAltroRap.get(String(v.rapportino_id));
      if (!sid) continue;
      const set = taskAceaAltrove.get(sid) ?? new Set<string>();
      set.add(tid);
      taskAceaAltrove.set(sid, set);
    }
  }

  const conflicts = rilevaConflitti({
    pianoId, territorio: piano.territorio ?? null, data: piano.data, operatori: operatoriPiano, esistenti,
  });
  if (conflicts.length > 0 && !opts.overwrite) return { ok: false, status: 409, conflicts };
  if (opts.overwrite === 'replace' && conflicts.some((c) => c.submitted) && !opts.overwriteSubmitted) {
    return { ok: false, status: 409, conflicts, error: 'submitted_richiede_conferma' };
  }

  const attore: AttoreAudit = opts.attore ?? { id: null, email: null };

  const staffInConflitto = new Set(conflicts.map((c) => c.staff_id));
  if (opts.overwrite === 'replace' && conflicts.length > 0) {
    await db.from('rapportini').delete().in('id', conflicts.map((c) => c.rapportino_id));
    await registraAzione({
      azione: 'rapportino.conflitto.sostituisci',
      attore,
      entita: 'mappa_piani',
      entitaId: pianoId,
      dettaglio: {
        data: piano.data,
        n_rapportini_eliminati: conflicts.length,
        // `submitted` = era già consegnato: la perdita più grave che questo ramo possa causare.
        rapportini_eliminati: conflicts.map((c) => ({
          rapportino_id: c.rapportino_id, staff_id: c.staff_id, staff_name: c.staff_name, inviato: c.submitted,
        })),
      },
    });
  }

  // Orfani NON eliminati perché protetti (inviato con skipInviati, o voci di altri motori):
  // si segnalano in interventiWarning invece di sparire in silenzio.
  const orfaniProtetti: Array<{ id: string; staff_id: string; staff_name: string | null; stato: string; motivo: string }> = [];
  const currentStaffIds = (ops ?? []).map((o) => String(o.staff_id));
  if (currentStaffIds.length > 0) {
    const { data: existingRaps } = await db
      .from('rapportini').select('id, staff_id, staff_name, stato, submitted_at').eq('piano_id', pianoId);
    const righe = (existingRaps as Array<{
      id: string; staff_id: string; staff_name: string | null; stato: string; submitted_at: string | null;
    }>) ?? [];
    const candidati = orphanRapportini(righe, currentStaffIds);
    if (candidati.length > 0) {
      /*
        GUARDIE ANTI-DISTRUZIONE del blocco orfani. Il loop per-operatore più sotto ha le sue
        (skipInviati salta gli inviati, il delete tocca solo origine='task'), ma questo blocco
        gira PRIMA e cancella l'INTERO rapportino: senza guardie, togliere un operatore dal
        piano (anche per un payload PUT stantio) radeva via un rapportino inviato o pieno di
        voci acea compilate — l'incidente PASTORELLI riaperto dall'altro verso.

         1. con opts.skipInviati (sync automatico dal Salva) un rapportino INVIATO non si
            elimina mai: la stessa promessa che skipInviati fa nel loop voci vale qui;
         2. un rapportino con voci di ALTRI motori (origine != 'task': acea o manuale) non è
            posseduto da questo motore e non si elimina MAI — il motore commessa lo
            ri-adotterà al prossimo Genera (regola 1 di scegliPianoCommessa).
      */
      const conVociAltrui = new Set<string>();
      {
        const sel = await db.from('rapportino_voci')
          .select('rapportino_id').in('rapportino_id', candidati).neq('origine', 'task');
        if (!sel.error) {
          for (const v of (sel.data ?? []) as Array<{ rapportino_id: string }>) conVociAltrui.add(String(v.rapportino_id));
        } else if (/origine/i.test(sel.error.message) && /column|schema/i.test(sel.error.message)) {
          // Migration `origine` non applicata: il filtro storico è `manuale != false`.
          const selFallback = await db.from('rapportino_voci')
            .select('rapportino_id').in('rapportino_id', candidati).neq('manuale', false);
          for (const v of (selFallback.data ?? []) as Array<{ rapportino_id: string }>) conVociAltrui.add(String(v.rapportino_id));
        }
      }
      const motivoProtezione = (r: { id: string; stato: string }): string | null => {
        if (opts.skipInviati && r.stato === 'inviato') return 'rapportino inviato (skipInviati)';
        if (conVociAltrui.has(r.id)) return 'contiene voci di altri moduli (commessa/+)';
        return null;
      };
      for (const r of righe) {
        if (!candidati.includes(r.id)) continue;
        const motivo = motivoProtezione(r);
        if (motivo) orfaniProtetti.push({ id: r.id, staff_id: r.staff_id, staff_name: r.staff_name, stato: r.stato, motivo });
      }
      const protettiIds = new Set(orfaniProtetti.map((p) => p.id));
      const toRemove = candidati.filter((id) => !protettiIds.has(id));
      if (toRemove.length > 0) {
        const eliminati = righe.filter((r) => toRemove.includes(r.id));
        await db.from('rapportini').delete().in('id', toRemove);
        // Sparizione silenziosa per definizione: l'utente ha salvato un piano, non chiesto di
        // cancellare un rapportino. Il 03/08 è mancata proprio questa riga.
        await registraAzione({
          azione: 'rapportino.orfano.elimina',
          attore,
          entita: 'mappa_piani',
          entitaId: pianoId,
          dettaglio: {
            data: piano.data,
            motivo: 'operatore non più nel piano',
            n_rapportini_eliminati: eliminati.length,
            rapportini_eliminati: eliminati,
            // Rapportini orfani risparmiati dalle guardie: chi legge il log deve vedere anche
            // cosa NON è stato cancellato e perché.
            n_rapportini_protetti: orfaniProtetti.length,
            rapportini_protetti: orfaniProtetti,
          },
        });
      }
    }
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const out: { staff_id: string; staff_name: string | null; token: string; url: string }[] = [];
  const expires = scadenzaIso(piano.data);

  let interventiWarning: string | undefined;
  // ODL con positivo altrove (calcolati da ensureInterventiForPiano): un ODL già eseguito
  // positivo è definitivamente chiuso → niente intervento E niente voce di rapportino.
  let odlGiaPositivi = new Set<string>();
  let positiviInfo = new Map<string, PositivoDettaglio>();
  try {
    const ens = await ensureInterventiForPiano(db, pianoId);
    if (ens.error) interventiWarning = ens.error;
    if (ens.odlGiaPositivi) odlGiaPositivi = ens.odlGiaPositivi;
    if (ens.positiviInfo) positiviInfo = ens.positiviInfo;
  } catch (e) {
    interventiWarning = (e instanceof Error ? e.message : String(e)) || 'errore ensure interventi';
  }
  if (interventiWarning) console.error('sincronizza: ensureInterventiForPiano:', interventiWarning);

  const { data: intRows } = await db
    .from('interventi').select('id, staff_id, odl, matricola_contatore, pdr, stato, committente, gruppo_attivita, indirizzo').eq('piano_id', pianoId);
  const resolveIntervento = buildVoceInterventoLinker((intRows ?? []) as InterventoLinkRow[]);

  /*
    Cintura same-piano per i task `acea:*` — completa G1 e taskAceaAltrove, che coprono
    rispettivamente lo STESSO rapportino e i rapportini di ALTRI piani. Il buco era il caso
    stesso-piano-altro-operatore: un task acea spostato in pianifica da PASTORELLI a ROSSI
    lascia la voce acea (magari compilata) nel rapportino di PASTORELLI, e senza questa mappa
    ROSSI riceverebbe una voce 'task' doppione sullo stesso lavoro. Chi possiede la voce acea
    resta l'unico a rendicontarla: il task sotto un altro operatore non genera niente.
    Letta DOPO il blocco orfani/conflitti, così riflette i rapportini davvero sopravvissuti.
  */
  const aceaStaffByTask = new Map<string, Set<string>>();
  {
    const { data: rapsPiano } = await db.from('rapportini').select('id, staff_id').eq('piano_id', pianoId);
    const staffByRapPiano = new Map(((rapsPiano ?? []) as Array<{ id: string; staff_id: string }>)
      .map((r) => [String(r.id), String(r.staff_id)]));
    if (staffByRapPiano.size > 0) {
      const { data: vociPiano } = await db
        .from('rapportino_voci')
        .select('rapportino_id, task_id')
        .in('rapportino_id', [...staffByRapPiano.keys()]);
      for (const v of (vociPiano ?? []) as Array<{ rapportino_id: string; task_id: string | null }>) {
        const tid = String(v.task_id ?? '');
        if (!tid.startsWith('acea:')) continue;
        const sid = staffByRapPiano.get(String(v.rapportino_id));
        if (!sid) continue;
        const set = aceaStaffByTask.get(tid) ?? new Set<string>();
        set.add(sid);
        aceaStaffByTask.set(tid, set);
      }
    }
  }

  // Rapportino per-attività: ogni voce prende le azioni dal flusso del GRUPPO ATTIVITA' del suo
  // intervento (collegamento su rapportino_template). Se l'intervento non c'è — import del file
  // template ODL, aggancio per ODL/matricola non riuscito, intervento nato su un altro piano —
  // si classifica il TASK con i suoi dati (committente dichiarato o tassonomia dell'attività):
  // è il motivo per cui le voci ACEA di un giro misto non ereditano più il modulo del rapportino.
  const gruppoByIntervento = new Map(
    ((intRows ?? []) as Array<{ id: string; committente?: string | null; gruppo_attivita?: string | null }>)
      .map((i) => [i.id, { committente: i.committente ?? null, gruppo: i.gruppo_attivita ?? null }]),
  );
  const taskSenzaFlusso = new Set<string>();
  const flussoPerVoce = (
    interventoId: string | null,
    task?: TaskClassificabile | null,
  ): { template_id: string; campi_snapshot: TemplateCampo[] } | null => {
    if (flussi.length === 0) return null;
    const int = interventoId ? gruppoByIntervento.get(interventoId) : null;
    const flusso = int
      ? risolviFlussoPerGruppo(committenteEquivalente(int.committente), int.gruppo, flussi)
      : risolviFlussoDaTask(task, tassIndex, flussi);
    if (!flusso || !Array.isArray(flusso.campi) || flusso.campi.length === 0) {
      // Solo i task: un intervento senza flusso è già coperto dal fallback del rapportino, che
      // per lui è il modulo del suo committente. Qui invece non sappiamo di chi sia il lavoro.
      if (!int) {
        const eti = String(task?.attivita ?? '').trim();
        if (eti) taskSenzaFlusso.add(eti);
      }
      return null;
    }
    return { template_id: flusso.id, campi_snapshot: flusso.campi as TemplateCampo[] };
  };

  // Blocco: un intervento 'completato' non può cambiare operatore (riassegnazione vietata).
  // Dopo ensureInterventiForPiano i completati mantengono lo staff_id originale: se un task
  // proposto con lo stesso ODL è sotto un operatore diverso, è uno spostamento illecito.
  const statoByOdl = new Map<string, { staff: string; stato: string }>();
  for (const it of (intRows ?? []) as Array<{ staff_id: string | null; odl: string | null; stato: string }>) {
    const k = normOdl(it.odl);
    if (k) statoByOdl.set(k, { staff: String(it.staff_id ?? ''), stato: it.stato });
  }
  const violati: string[] = [];
  for (const op of ops ?? []) {
    for (const t of ((op.tasks as Array<{ odl?: string | null }>) ?? [])) {
      const hit = statoByOdl.get(normOdl(t.odl));
      if (hit && hit.stato === 'completato' && hit.staff !== String(op.staff_id)) {
        violati.push(normOdl(t.odl));
      }
    }
  }
  if (violati.length > 0) {
    return { ok: false, status: 409, error: `spostamento_completato:${violati.join(',')}` };
  }

  // Dedup ODL a livello di VOCI, condiviso tra gli operatori del piano: lo stesso ODL non
  // deve produrre due voci (es. import file + template) né una voce su ODL già positivo.
  const vistiOdlVoci = new Set<string>();
  const odlBloccatiVoci = new Set<string>();
  // Operatori per cui NON si crea il rapportino perché il loro lavoro commessa è già tutto
  // rendicontato altrove (G2): si segnala, non si tace.
  const g2Saltati: string[] = [];

  for (const op of ops ?? []) {
    if (opts.overwrite === 'skip' && staffInConflitto.has(String(op.staff_id))) continue;
    const tasksOp = ((op.tasks as Array<{ id?: unknown; odl?: string | null; matricola?: string | null }>) ?? []);
    const { data: existing } = await db.from('rapportini')
      .select('id, token, stato, template_id').eq('piano_id', pianoId).eq('staff_id', op.staff_id).maybeSingle();

    // Modello di TESTATA dell'operatore (vedi il commento alla risoluzione, più sopra):
    // esplicito → il suo rapportino esistente (sticky) → risanamento sui SUOI task →
    // prevalente dei SUOI task → prevalente del piano. Il modello segue il lavoro
    // dell'operatore: quello di un collega dello stesso giro non è più contagioso.
    const tasksOpClassificabili = tasksOp as TaskClassificabile[];
    const templateIdRisolto =
      templateEsplicito ??
      ((existing as { template_id?: string | null } | null)?.template_id ?? null) ??
      (pianoHaRisanamento(tasksOpClassificabili) ? risolviTemplateRisanamento(candidatiRisanamento) : null) ??
      flussoPrevalente(tasksOpClassificabili, tassIndex, flussi) ??
      prevalentePiano;
    const tplOp = templateIdRisolto ? await caricaTplTestata(templateIdRisolto) : null;
    const templateId = tplOp ? templateIdRisolto : null;
    const tpl = tplOp ?? TPL_VUOTO;
    // Sync automatico (skipInviati): un rapportino già consegnato non va alterato senza conferma
    // esplicita → lo si lascia intatto (voci e stato). La riapertura resta nel flusso Genera/Conferma.
    if (opts.skipInviati && (existing as { stato?: string } | null)?.stato === 'inviato') continue;
    // G2: nessun rapportino NUOVO per chi ha solo task `acea:*` già rendicontati nel suo
    // rapportino (misto) di un altro piano. Un rapportino ESISTENTE su questo piano invece
    // si aggiorna normalmente.
    if (!existing?.id) {
      const altrove = taskAceaAltrove.get(String(op.staff_id));
      if (altrove && altrove.size > 0 && tuttiTaskRendicontatiAltrove(tasksOp, altrove)) {
        g2Saltati.push(op.staff_name ?? String(op.staff_id));
        continue;
      }
    }
    let rapId = existing?.id;
    let token = existing?.token;
    if (!rapId) {
      token = randomBytes(24).toString('base64url');
      const { data: ins, error: eIns } = await db.from('rapportini').insert({
        piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
        template_id: templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], tipo: tpl.tipo ?? 'standard', token, stato: 'in_corso', expires_at: expires,
      }).select('id').single();
      if (eIns) return { ok: false, status: 500, error: eIns.message };
      rapId = ins!.id;
    } else {
      // Rapportino già esistente: aggiorna template/scadenza. Se è 'inviato' e l'utente
      // ha confermato, riaprilo (torna compilabile) valorizzando riaperto_at.
      const { data: cur } = await db.from('rapportini').select('stato').eq('id', rapId).maybeSingle();
      const eraInviato = (cur as { stato?: string } | null)?.stato === 'inviato';
      const patch: Record<string, unknown> = {
        template_id: templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], tipo: tpl.tipo ?? 'standard', expires_at: expires,
      };
      if (eraInviato && opts.confermaInviati) {
        patch.stato = 'in_corso';
        patch.riaperto_at = new Date().toISOString();
      }
      await db.from('rapportini').update(patch).eq('id', rapId);
    }

    // IMPORTANTE: questo motore possiede SOLO le voci da-task (origine='task'). Le voci MANUALI
    // (dal "+" dell'operatore) e quelle del motore ACEA (aggiunte a un rapportino esistente per la
    // regola "un rapportino per operatore per giorno") non derivano dai task del piano e NON vanno
    // ricostruite: leggerle/cancellarle qui farebbe perdere gli interventi dal "+" e raderebbe via
    // le voci ACEA alla prima rigenerazione del piano.
    //
    // Se la migration 20260727091000 non è ancora applicata (deploy del codice che precede il DB),
    // si ripiega sul filtro storico `manuale=false`. Senza questo fallback la select fallirebbe,
    // il delete pure — ed essendo entrambi senza controllo dell'errore, l'insert successivo
    // creerebbe voci DUPLICATE sui rapportini esistenti.
    let filtroMotore: { campo: 'origine' | 'manuale'; valore: unknown } = { campo: 'origine', valore: 'task' };
    const selVoci = await db.from('rapportino_voci')
      .select('task_id, risposte, raw_json').eq('rapportino_id', rapId).eq('origine', 'task');
    let existingVoci = selVoci.data;
    const eSelVoci = selVoci.error;
    if (eSelVoci && /origine/i.test(eSelVoci.message) && /column|schema/i.test(eSelVoci.message)) {
      filtroMotore = { campo: 'manuale', valore: false };
      ({ data: existingVoci } = await db.from('rapportino_voci')
        .select('task_id, risposte, raw_json').eq('rapportino_id', rapId).eq('manuale', false));
    }
    const existingRows = (existingVoci as Array<{ task_id: string; risposte: Record<string, unknown> | null; raw_json: unknown }>) ?? [];
    const existingTaskIds = new Set(existingRows.map((v) => v.task_id));
    const prevNuovoByTask = new Map<string, boolean>(
      existingRows.map((v) => [v.task_id, Boolean((v.raw_json as { _nuovo?: unknown } | null)?._nuovo)]),
    );
    const rapPreesisteva = Boolean(existing?.id);
    // Voci da-task già COMPILATE: non si toccano mai (rigenerare un piano storico non
    // cancella lavoro registrato). Il set serve sia a G1 (un task compilato non si filtra:
    // filtrarlo = cancellare la voce senza ricrearla) sia a taskDaSaltare qui sotto.
    const compilate = new Set(
      existingRows.filter((v) => Object.keys(v.risposte ?? {}).length > 0).map((v) => v.task_id),
    );

    /*
      G1 (guardia commessa) — le voci SUPERSTITI degli altri motori su questo stesso
      rapportino (origine 'acea' o 'manuale': quelle che il delete qui sotto non tocca).
      Un task già coperto da una di loro NON deve rigenerare una voce 'task': con i task
      della commessa il match è esatto (`Task.id = task_id` della voce acea), l'unità
      ODL(+matricola) fa da cintura per le SOLE voci acea — una voce manuale può condividere
      l'ODL con un task Excel legittimo, e filtrarlo cancellerebbe la sua voce compilata
      (regressione FIRENZE/PERUGIA/LAZIO). Le voci restano acea, le risposte restano
      intatte, zero doppioni. Stesso filtro (negato) del delete: se la migration `origine`
      manca, si ripiega su `manuale != false` — e senza colonna `origine` non esistono voci
      acea, quindi la cintura ODL resta correttamente spenta.
    */
    let vociAltrui: VoceAltrui[] = [];
    {
      const colonneAltrui = filtroMotore.campo === 'origine' ? 'task_id, odl, matricola, origine' : 'task_id, odl, matricola';
      const selAltrui = await db.from('rapportino_voci')
        .select(colonneAltrui)
        .eq('rapportino_id', rapId)
        .neq(filtroMotore.campo, filtroMotore.valore);
      if (!selAltrui.error) vociAltrui = ((selAltrui.data ?? []) as unknown) as VoceAltrui[];
    }
    // Cinture cross-rapportino, per soli id `acea:*` (deterministici): un task della commessa
    // già rendicontato nel rapportino misto di un altro piano (taskAceaAltrove) o nel
    // rapportino di un ALTRO operatore di questo stesso piano (aceaStaffByTask, task spostato
    // in pianifica) non va duplicato.
    const aceaAltrove = taskAceaAltrove.get(String(op.staff_id));
    const tasksNonRendicontati = filtraTaskRendicontati(tasksOp, vociAltrui, { taskConRisposte: compilate })
      .filter((t) => {
        const id = String(t.id ?? '');
        if (aceaAltrove?.has(id)) return false;
        const owners = aceaStaffByTask.get(id);
        return !(owners && [...owners].some((s) => s !== String(op.staff_id)));
      });
    const { salta, odlBloccati: bloccatiOp } = taskDaSaltare({
      tasks: tasksNonRendicontati.map((t) => ({
        id: String(t.id ?? ''),
        odl: t.odl ?? null,
      })),
      odlGiaPositivi,
      vistiOdl: vistiOdlVoci,
      voceCompilata: (taskId) => compilate.has(taskId),
    });
    bloccatiOp.forEach((o) => odlBloccatiVoci.add(o));
    // Ordine voci = ordine del file master (task.ordine/id "row-N"), NON la posizione nella rotta
    // ottimizzata: il rapportino segue la sequenza del master. La mappa (op.tasks) resta invariata.
    const ranks = rankOrdineDaFile((op.tasks as Array<{ id: string; ordine?: number }>) ?? []);
    const fromTasks = (tasksNonRendicontati as unknown[])
      .filter((t) => !salta.has(String((t as { id?: unknown }).id ?? '')))
      .map((t, i) => taskToVoce(t, ranks[(t as { id?: string }).id ?? ''] ?? i + 1));
    const existingAsVoci: Voce[] = existingRows.map((v) => ({ task_id: v.task_id, ordine: 0, raw_json: {}, risposte: v.risposte ?? {} }));
    const merged = mergeVoci(fromTasks, existingAsVoci);

    await db.from('rapportino_voci').delete().eq('rapportino_id', rapId)
      .eq(filtroMotore.campo, filtroMotore.valore);
    if (merged.length) {
      const vociRows = merged.map(({ annullato, ...v }) => {
        const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
        const intervento_id = resolveIntervento({
          staff_id: op.staff_id,
          odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
          matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
          pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
          // Task-via (bonifiche extra): niente ODL/matricola/PDR → aggancio per via al suo intervento.
          via: v.via,
          taskVia: isTaskVia(v),
        });
        const nuovo = existingTaskIds.has(v.task_id) ? (prevNuovoByTask.get(v.task_id) ?? false) : rapPreesisteva;
        const raw_json = { ...(v.raw_json && typeof v.raw_json === 'object' ? v.raw_json : {}), _nuovo: nuovo, _annullato: Boolean(annullato) };
        // Voce per-attività: azioni dal flusso del gruppo del suo intervento, o — se l'intervento
        // manca — dalla classificazione del task stesso (`raw_json` è il task originale, con
        // committente e attività). Le chiavi si scrivono solo se la select dei flussi è passata:
        // così una migration voci non ancora applicata non fa fallire l'insert.
        const flussoVoce = flussi.length > 0
          ? flussoPerVoce(intervento_id, raw_json as TaskClassificabile)
          : null;
        return {
          rapportino_id: rapId, intervento_id, ...v, raw_json,
          ...(flussi.length > 0 ? { template_id: flussoVoce?.template_id ?? null, campi_snapshot: flussoVoce?.campi_snapshot ?? null } : {}),
        };
      });
      let { error: eVoci } = await db.from('rapportino_voci').insert(vociRows);
      // Race: una generazione concorrente può aver ricreato gli interventi (id cambiati) →
      // FK violation su intervento_id. PRIMA di rinunciare al collegamento si rilegge lo stato
      // fresco degli interventi del piano e si riaggancia: gli id sono cambiati ma le chiavi
      // (ODL/matricola/PDR) no. Il fallback a NULL resta solo come ultima spiaggia: una voce
      // salvata scollegata che nessuno risalva più resta orfana per sempre (i 267 del
      // 2026-08-05, col «SI» che non arrivava mai all'intervento).
      if (eVoci && isInterventoFkError(eVoci.message)) {
        const { data: intFreschi } = await db
          .from('interventi')
          .select('id, staff_id, odl, matricola_contatore, pdr, stato, committente, gruppo_attivita, indirizzo')
          .eq('piano_id', pianoId);
        const resolveFresco = buildVoceInterventoLinker((intFreschi ?? []) as InterventoLinkRow[]);
        const riagganciate = vociRows.map((r) => {
          const raw = ((r as { raw_json?: unknown }).raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
          const v = r as { odl?: string | null; matricola?: string | null; pdr?: string | null; via?: string | null };
          return {
            ...r,
            intervento_id: resolveFresco({
              staff_id: op.staff_id,
              odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
              matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
              pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
              via: v.via,
              taskVia: isTaskVia(r as never),
            }),
          };
        });
        ({ error: eVoci } = await db.from('rapportino_voci').insert(riagganciate));
        if (eVoci && isInterventoFkError(eVoci.message)) {
          ({ error: eVoci } = await db.from('rapportino_voci').insert(vociRows.map((r) => ({ ...r, intervento_id: null }))));
        }
      }
      // Migration voci per-attività non ancora applicata (colonne assenti nello schema cache):
      // riprova senza le colonne per-voce — comportamento identico al pre-feature.
      if (eVoci && /template_id|campi_snapshot/i.test(eVoci.message) && /column|schema/i.test(eVoci.message)) {
        ({ error: eVoci } = await db.from('rapportino_voci').insert(vociRows.map((r) => {
          const rest = { ...(r as Record<string, unknown>) };
          delete rest.template_id;
          delete rest.campi_snapshot;
          return rest;
        })));
      }
      if (eVoci) return { ok: false, status: 500, error: eVoci.message };
    }
    out.push({ staff_id: op.staff_id, staff_name: op.staff_name ?? null, token: token!, url: `${baseUrl}/r/${token}` });
  }

  if (g2Saltati.length > 0) {
    const msg = `Rapportino non creato per ${g2Saltati.join(', ')}: lavoro della commessa già rendicontato nel rapportino del giorno su un altro piano.`;
    interventiWarning = interventiWarning ? `${interventiWarning} | ${msg}` : msg;
  }
  if (orfaniProtetti.length > 0) {
    // Non è un errore: è la guardia che ha impedito una cancellazione. Ma l'anomalia
    // (operatore fuori dal piano con un rapportino ancora dentro) va detta, non taciuta.
    const nomi = orfaniProtetti.map((p) => p.staff_name ?? p.staff_id).join(', ');
    const msg = `Rapportino di ${nomi} NON eliminato: l'operatore non è più nel piano ma il rapportino è inviato o contiene voci di altri moduli (commessa/+). Verificare la pianificazione.`;
    interventiWarning = interventiWarning ? `${interventiWarning} | ${msg}` : msg;
  }

  return {
    ok: true,
    rapportini: out,
    interventiWarning,
    ...(odlBloccatiVoci.size > 0
      ? {
          odlBloccati: [...odlBloccatiVoci],
          odlBloccatiDettagli: dettagliOdlBloccati([...odlBloccatiVoci], positiviInfo),
        }
      : {}),
    ...(taskSenzaFlusso.size > 0 ? { taskSenzaFlusso: [...taskSenzaFlusso] } : {}),
  };
}
