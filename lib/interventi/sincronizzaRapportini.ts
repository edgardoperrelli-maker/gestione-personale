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

export type SincronizzaOpts = {
  templateId: string;
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
};

export type SincronizzaResult =
  | { ok: true; rapportini: { staff_id: string; staff_name: string | null; token: string; url: string }[]; interventiWarning?: string }
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
  const { data: tpl } = await db.from('rapportino_template').select('id, campi, info_campi, tipo').eq('id', opts.templateId).single();
  if (!tpl) return { ok: false, status: 404, error: 'Template non trovato' };
  const { data: ops } = await db.from('mappa_piani_operatori').select('staff_id, staff_name, tasks').eq('piano_id', pianoId);

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

  const conflicts = rilevaConflitti({
    pianoId, territorio: piano.territorio ?? null, data: piano.data, operatori: operatoriPiano, esistenti,
  });
  if (conflicts.length > 0 && !opts.overwrite) return { ok: false, status: 409, conflicts };
  if (opts.overwrite === 'replace' && conflicts.some((c) => c.submitted) && !opts.overwriteSubmitted) {
    return { ok: false, status: 409, conflicts, error: 'submitted_richiede_conferma' };
  }

  const staffInConflitto = new Set(conflicts.map((c) => c.staff_id));
  if (opts.overwrite === 'replace' && conflicts.length > 0) {
    await db.from('rapportini').delete().in('id', conflicts.map((c) => c.rapportino_id));
  }

  const currentStaffIds = (ops ?? []).map((o) => String(o.staff_id));
  if (currentStaffIds.length > 0) {
    const { data: existingRaps } = await db.from('rapportini').select('id, staff_id').eq('piano_id', pianoId);
    const toRemove = orphanRapportini((existingRaps as { id: string; staff_id: string }[]) ?? [], currentStaffIds);
    if (toRemove.length > 0) await db.from('rapportini').delete().in('id', toRemove);
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const out: { staff_id: string; staff_name: string | null; token: string; url: string }[] = [];
  const expires = scadenzaIso(piano.data);

  let interventiWarning: string | undefined;
  try {
    const ens = await ensureInterventiForPiano(db, pianoId);
    if (ens.error) interventiWarning = ens.error;
  } catch (e) {
    interventiWarning = (e instanceof Error ? e.message : String(e)) || 'errore ensure interventi';
  }
  if (interventiWarning) console.error('sincronizza: ensureInterventiForPiano:', interventiWarning);

  const { data: intRows } = await db
    .from('interventi').select('id, staff_id, odl, matricola_contatore, pdr, stato').eq('piano_id', pianoId);
  const resolveIntervento = buildVoceInterventoLinker((intRows ?? []) as InterventoLinkRow[]);

  // Blocco: un intervento 'completato' non può cambiare operatore (riassegnazione vietata).
  // Dopo ensureInterventiForPiano i completati mantengono lo staff_id originale: se un task
  // proposto con lo stesso ODL è sotto un operatore diverso, è uno spostamento illecito.
  const normOdl = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
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

  for (const op of ops ?? []) {
    if (opts.overwrite === 'skip' && staffInConflitto.has(String(op.staff_id))) continue;
    const { data: existing } = await db.from('rapportini')
      .select('id, token, stato').eq('piano_id', pianoId).eq('staff_id', op.staff_id).maybeSingle();
    // Sync automatico (skipInviati): un rapportino già consegnato non va alterato senza conferma
    // esplicita → lo si lascia intatto (voci e stato). La riapertura resta nel flusso Genera/Conferma.
    if (opts.skipInviati && (existing as { stato?: string } | null)?.stato === 'inviato') continue;
    let rapId = existing?.id;
    let token = existing?.token;
    if (!rapId) {
      token = randomBytes(24).toString('base64url');
      const { data: ins, error: eIns } = await db.from('rapportini').insert({
        piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
        template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], tipo: tpl.tipo ?? 'standard', token, stato: 'in_corso', expires_at: expires,
      }).select('id').single();
      if (eIns) return { ok: false, status: 500, error: eIns.message };
      rapId = ins!.id;
    } else {
      // Rapportino già esistente: aggiorna template/scadenza. Se è 'inviato' e l'utente
      // ha confermato, riaprilo (torna compilabile) valorizzando riaperto_at.
      const { data: cur } = await db.from('rapportini').select('stato').eq('id', rapId).maybeSingle();
      const eraInviato = (cur as { stato?: string } | null)?.stato === 'inviato';
      const patch: Record<string, unknown> = {
        template_id: opts.templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], tipo: tpl.tipo ?? 'standard', expires_at: expires,
      };
      if (eraInviato && opts.confermaInviati) {
        patch.stato = 'in_corso';
        patch.riaperto_at = new Date().toISOString();
      }
      await db.from('rapportini').update(patch).eq('id', rapId);
    }

    // IMPORTANTE: le voci MANUALI (create dal "+") NON derivano dai task del piano e NON
    // vanno ricostruite. Si leggono/cancellano solo le voci da-task (manuale=false): la
    // rigenerazione/salvataggio del piano altrimenti perderebbe gli interventi dal "+".
    const { data: existingVoci } = await db.from('rapportino_voci')
      .select('task_id, risposte, raw_json').eq('rapportino_id', rapId).eq('manuale', false);
    const existingRows = (existingVoci as Array<{ task_id: string; risposte: Record<string, unknown> | null; raw_json: unknown }>) ?? [];
    const existingTaskIds = new Set(existingRows.map((v) => v.task_id));
    const prevNuovoByTask = new Map<string, boolean>(
      existingRows.map((v) => [v.task_id, Boolean((v.raw_json as { _nuovo?: unknown } | null)?._nuovo)]),
    );
    const rapPreesisteva = Boolean(existing?.id);
    // Ordine voci = ordine del file master (task.ordine/id "row-N"), NON la posizione nella rotta
    // ottimizzata: il rapportino segue la sequenza del master. La mappa (op.tasks) resta invariata.
    const ranks = rankOrdineDaFile((op.tasks as Array<{ id: string; ordine?: number }>) ?? []);
    const fromTasks = ((op.tasks as unknown[]) ?? []).map((t, i) => taskToVoce(t, ranks[(t as { id?: string }).id ?? ''] ?? i + 1));
    const existingAsVoci: Voce[] = existingRows.map((v) => ({ task_id: v.task_id, ordine: 0, raw_json: {}, risposte: v.risposte ?? {} }));
    const merged = mergeVoci(fromTasks, existingAsVoci);

    await db.from('rapportino_voci').delete().eq('rapportino_id', rapId).eq('manuale', false);
    if (merged.length) {
      const vociRows = merged.map(({ annullato, ...v }) => {
        const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
        const intervento_id = resolveIntervento({
          staff_id: op.staff_id,
          odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
          matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
          pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
        });
        const nuovo = existingTaskIds.has(v.task_id) ? (prevNuovoByTask.get(v.task_id) ?? false) : rapPreesisteva;
        const raw_json = { ...(v.raw_json && typeof v.raw_json === 'object' ? v.raw_json : {}), _nuovo: nuovo, _annullato: Boolean(annullato) };
        return { rapportino_id: rapId, intervento_id, ...v, raw_json };
      });
      let { error: eVoci } = await db.from('rapportino_voci').insert(vociRows);
      // Race: una generazione concorrente può aver ricreato gli interventi (id cambiati) →
      // FK violation su intervento_id. Fallback: salva le voci SENZA collegamento intervento
      // (campo opzionale), che si ricollega alla generazione successiva. Evita il 500.
      if (eVoci && isInterventoFkError(eVoci.message)) {
        ({ error: eVoci } = await db.from('rapportino_voci').insert(vociRows.map((r) => ({ ...r, intervento_id: null }))));
      }
      if (eVoci) return { ok: false, status: 500, error: eVoci.message };
    }
    out.push({ staff_id: op.staff_id, staff_name: op.staff_name ?? null, token: token!, url: `${baseUrl}/r/${token}` });
  }

  return { ok: true, rapportini: out, interventiWarning };
}
