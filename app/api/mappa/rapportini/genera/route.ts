import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { taskToVoce, mergeVoci, type Voce } from '@/utils/rapportini/buildVoci';
import { orphanRapportini } from '@/utils/rapportini/orphans';
import { scadenzaIso } from '@/utils/rapportini/scadenza';
import { requireUser } from '@/lib/apiAuth';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import { rilevaConflitti, type RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { pianoId, templateId, overwrite, overwriteSubmitted } = await req.json() as { pianoId?: string; templateId?: string; overwrite?: 'replace' | 'skip'; overwriteSubmitted?: boolean };
    if (!pianoId || !templateId) return NextResponse.json({ error: 'pianoId e templateId obbligatori' }, { status: 400 });

    const { data: piano } = await supabaseAdmin.from('mappa_piani').select('id, data, territorio').eq('id', pianoId).single();
    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('id, campi, info_campi').eq('id', templateId).single();
    if (!tpl) return NextResponse.json({ error: 'Template non trovato' }, { status: 404 });
    const { data: ops } = await supabaseAdmin.from('mappa_piani_operatori')
      .select('staff_id, staff_name, tasks').eq('piano_id', pianoId);

    const operatoriPiano = (ops ?? []).map((o) => ({ staff_id: String(o.staff_id), staff_name: (o.staff_name as string | null) ?? null }));

    // Candidati: rapportini di ALTRI piani, stessa data, stessi operatori.
    const { data: altriRaps, error: eAltri } = await supabaseAdmin
      .from('rapportini')
      .select('id, staff_id, piano_id, data, stato, submitted_at')
      .eq('data', piano.data)
      .neq('piano_id', pianoId)
      .in('staff_id', operatoriPiano.map((o) => o.staff_id));
    if (eAltri) return NextResponse.json({ error: eAltri.message }, { status: 500 });

    // Risolvi il territorio dei piani candidati.
    const altriPianoIds = [...new Set((altriRaps ?? []).map((r) => r.piano_id as string))];
    const terrByPiano: Record<string, string | null> = {};
    if (altriPianoIds.length) {
      const { data: altriPiani, error: ePiani } = await supabaseAdmin.from('mappa_piani').select('id, territorio').in('id', altriPianoIds);
      if (ePiani) return NextResponse.json({ error: ePiani.message }, { status: 500 });
      (altriPiani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
    }
    const esistenti: RapEsistente[] = (altriRaps ?? []).map((r) => ({
      id: r.id as string, staff_id: String(r.staff_id), piano_id: r.piano_id as string,
      territorio: terrByPiano[r.piano_id as string] ?? null, data: r.data as string,
      stato: r.stato as string, submitted_at: (r.submitted_at as string | null) ?? null,
    }));

    const conflicts = rilevaConflitti({
      pianoId, territorio: piano.territorio ?? null, data: piano.data,
      operatori: operatoriPiano, esistenti,
    });

    // Fase 1: ci sono conflitti e l'utente non ha ancora deciso → 409.
    if (conflicts.length > 0 && !overwrite) {
      return NextResponse.json({ conflicts }, { status: 409 });
    }

    if (overwrite === 'replace' && conflicts.some((c) => c.submitted) && !overwriteSubmitted) {
      return NextResponse.json({ conflicts, error: 'submitted_richiede_conferma' }, { status: 409 });
    }

    const staffInConflitto = new Set(conflicts.map((c) => c.staff_id));
    if (overwrite === 'replace' && conflicts.length > 0) {
      await supabaseAdmin.from('rapportini').delete().in('id', conflicts.map((c) => c.rapportino_id));
    }

    // Pulizia rapportini orfani: operatori non più nel piano → rimuovi rapportino (+ voci a cascata)
    const currentStaffIds = (ops ?? []).map((o) => String(o.staff_id));
    if (currentStaffIds.length > 0) {
      const { data: existingRaps } = await supabaseAdmin
        .from('rapportini')
        .select('id, staff_id')
        .eq('piano_id', pianoId);
      const toRemove = orphanRapportini((existingRaps as { id: string; staff_id: string }[]) ?? [], currentStaffIds);
      if (toRemove.length > 0) {
        await supabaseAdmin.from('rapportini').delete().in('id', toRemove);
      }
    }

    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
    const out: { staff_id: string; staff_name: string | null; token: string; url: string }[] = [];
    const expires = scadenzaIso(piano.data);

    // Unificazione: garantisci gli interventi del piano PRIMA di collegare le voci.
    // Best-effort: se fallisce, logga ma prosegui con la generazione rapportini.
    let interventiWarning: string | undefined;
    try {
      const ens = await ensureInterventiForPiano(supabaseAdmin, pianoId);
      if (ens.error) interventiWarning = ens.error;
    } catch (e) {
      interventiWarning = (e instanceof Error ? e.message : String(e)) || 'errore ensure interventi';
    }
    if (interventiWarning) console.error('genera: ensureInterventiForPiano:', interventiWarning);

    // Interventi del piano per collegare ogni voce (aggancio robusto: ODL/matricola/PDR).
    const { data: intRows } = await supabaseAdmin
      .from('interventi')
      .select('id, staff_id, odl, matricola_contatore, pdr')
      .eq('piano_id', pianoId);
    const resolveIntervento = buildVoceInterventoLinker((intRows ?? []) as InterventoLinkRow[]);

    for (const op of ops ?? []) {
      if (overwrite === 'skip' && staffInConflitto.has(String(op.staff_id))) continue;
      const { data: existing } = await supabaseAdmin.from('rapportini')
        .select('id, token').eq('piano_id', pianoId).eq('staff_id', op.staff_id).maybeSingle();
      let rapId = existing?.id;
      let token = existing?.token;
      if (!rapId) {
        token = randomBytes(24).toString('base64url');
        const { data: ins, error: eIns } = await supabaseAdmin.from('rapportini').insert({
          piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
          template_id: templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], token, stato: 'in_corso', expires_at: expires,
        }).select('id').single();
        if (eIns) throw new Error(eIns.message);
        rapId = ins!.id;
      } else {
        await supabaseAdmin.from('rapportini')
          .update({ template_id: templateId, campi_snapshot: tpl.campi, info_snapshot: tpl.info_campi ?? [], expires_at: expires }).eq('id', rapId);
      }

      const { data: existingVoci } = await supabaseAdmin.from('rapportino_voci')
        .select('task_id, risposte, raw_json').eq('rapportino_id', rapId);
      const existingRows = (existingVoci as Array<{ task_id: string; risposte: Record<string, unknown> | null; raw_json: unknown }>) ?? [];
      const existingTaskIds = new Set(existingRows.map((v) => v.task_id));
      // Flag "nuovo" persistito nel raw_json della voce precedente (se c'era).
      const prevNuovoByTask = new Map<string, boolean>(
        existingRows.map((v) => [v.task_id, Boolean((v.raw_json as { _nuovo?: unknown } | null)?._nuovo)]),
      );
      // Se il rapportino esisteva già, le voci con task_id mai visto sono interventi aggiunti dopo.
      const rapPreesisteva = Boolean(existing?.id);
      const fromTasks = ((op.tasks as unknown[]) ?? []).map((t, i) => taskToVoce(t, i + 1));
      const existingAsVoci: Voce[] = existingRows.map((v) => ({
        task_id: v.task_id, ordine: 0, raw_json: {}, risposte: v.risposte ?? {},
      }));
      const merged = mergeVoci(fromTasks, existingAsVoci);

      await supabaseAdmin.from('rapportino_voci').delete().eq('rapportino_id', rapId);
      if (merged.length) {
        const { error: eVoci } = await supabaseAdmin.from('rapportino_voci')
          .insert(merged.map((v) => {
            const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
            const intervento_id = resolveIntervento({
              staff_id: op.staff_id,
              odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
              matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
              pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
            });
            // Badge "NUOVO": preserva il flag precedente; voce mai vista su rapportino già esistente → nuova.
            const nuovo = existingTaskIds.has(v.task_id)
              ? (prevNuovoByTask.get(v.task_id) ?? false)
              : rapPreesisteva;
            const raw_json = { ...(v.raw_json && typeof v.raw_json === 'object' ? v.raw_json : {}), _nuovo: nuovo };
            return { rapportino_id: rapId, intervento_id, ...v, raw_json };
          }));
        if (eVoci) throw new Error(eVoci.message);
      }
      out.push({ staff_id: op.staff_id, staff_name: op.staff_name ?? null, token: token!, url: `${base}/r/${token}` });
    }
    return NextResponse.json({ ok: true, rapportini: out, interventiWarning });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore generazione rapportini.' }, { status: 500 });
  }
}
