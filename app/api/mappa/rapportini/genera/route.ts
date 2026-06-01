import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { taskToVoce, mergeVoci, type Voce } from '@/utils/rapportini/buildVoci';
import { orphanRapportini } from '@/utils/rapportini/orphans';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { pianoId, templateId } = await req.json();
    if (!pianoId || !templateId) return NextResponse.json({ error: 'pianoId e templateId obbligatori' }, { status: 400 });

    const { data: piano } = await supabaseAdmin.from('mappa_piani').select('id, data').eq('id', pianoId).single();
    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('id, campi').eq('id', templateId).single();
    if (!tpl) return NextResponse.json({ error: 'Template non trovato' }, { status: 404 });
    const { data: ops } = await supabaseAdmin.from('mappa_piani_operatori')
      .select('staff_id, staff_name, tasks').eq('piano_id', pianoId);

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
    const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    for (const op of ops ?? []) {
      const { data: existing } = await supabaseAdmin.from('rapportini')
        .select('id, token').eq('piano_id', pianoId).eq('staff_id', op.staff_id).maybeSingle();
      let rapId = existing?.id;
      let token = existing?.token;
      if (!rapId) {
        token = randomBytes(24).toString('base64url');
        const { data: ins, error: eIns } = await supabaseAdmin.from('rapportini').insert({
          piano_id: pianoId, staff_id: op.staff_id, staff_name: op.staff_name, data: piano.data,
          template_id: templateId, campi_snapshot: tpl.campi, token, stato: 'in_corso', expires_at: expires,
        }).select('id').single();
        if (eIns) throw new Error(eIns.message);
        rapId = ins!.id;
      } else {
        await supabaseAdmin.from('rapportini')
          .update({ template_id: templateId, campi_snapshot: tpl.campi, expires_at: expires }).eq('id', rapId);
      }

      const { data: existingVoci } = await supabaseAdmin.from('rapportino_voci')
        .select('task_id, risposte').eq('rapportino_id', rapId);
      const fromTasks = ((op.tasks as any[]) ?? []).map((t, i) => taskToVoce(t, i + 1));
      const existingAsVoci: Voce[] = ((existingVoci as any[]) ?? []).map((v) => ({
        task_id: v.task_id, ordine: 0, raw_json: {}, risposte: v.risposte ?? {},
      }));
      const merged = mergeVoci(fromTasks, existingAsVoci);

      await supabaseAdmin.from('rapportino_voci').delete().eq('rapportino_id', rapId);
      if (merged.length) {
        const { error: eVoci } = await supabaseAdmin.from('rapportino_voci')
          .insert(merged.map((v) => ({ rapportino_id: rapId, ...v })));
        if (eVoci) throw new Error(eVoci.message);
      }
      out.push({ staff_id: op.staff_id, staff_name: op.staff_name ?? null, token: token!, url: `${base}/r/${token}` });
    }
    return NextResponse.json({ ok: true, rapportini: out });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
