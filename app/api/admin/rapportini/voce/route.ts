import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import { sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
import { mergeRisposte } from '@/utils/rapportini/mergeRisposte';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

const Schema = z.object({
  rapportinoId: z.string().uuid(),
  voci: z
    .array(
      z.object({
        voceId: z.string().uuid(),
        risposte: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });
  const { rapportinoId, voci } = parsed.data;

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'Rapportino non trovato.' }, { status: 404 });
  const campi = ((rap as { campi_snapshot: unknown }).campi_snapshot ?? []) as TemplateCampo[];

  let aggiornate = 0;
  for (const item of voci) {
    const { data: voce } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, intervento_id, risposte, campi_snapshot')
      .eq('id', item.voceId)
      .eq('rapportino_id', rapportinoId)
      .maybeSingle();
    if (!voce) continue;
    const v = voce as { intervento_id: string | null; risposte: Record<string, unknown> | null; campi_snapshot?: unknown };
    // Esito/propagazione valutati sui campi DELLA voce (flusso del suo gruppo attività).
    const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
      ? (v.campi_snapshot as TemplateCampo[])
      : campi;

    // soloCompletamentoFoto: false → modalità modifica piena (le risposte corrette
    // vincono, le chiavi non toccate restano, le foto già caricate sono protette).
    const merged = mergeRisposte(v.risposte ?? {}, item.risposte, { soloCompletamentoFoto: false });
    const { error } = await supabaseAdmin
      .from('rapportino_voci')
      .update({ risposte: merged })
      .eq('id', item.voceId)
      .eq('rapportino_id', rapportinoId);
    if (error) {
      console.error('[admin/voce] update voce fallito:', error.message);
      continue;
    }
    aggiornate++;

    // Ripropagazione esito all'intervento (best-effort, identica alla route operatore):
    // 'completa' chiude l'intervento (qualsiasi stato tranne annullato);
    // 'riapri' annulla SOLO una nostra precedente chiusura (tocca solo se 'completato').
    if (v.intervento_id) {
      try {
        const patch = patchInterventoLiveDaVoce(merged, campiV);
        const interventoPatch =
          patch.azione === 'completa'
            ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() }
            : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null };
        const query = supabaseAdmin.from('interventi').update(interventoPatch).eq('id', v.intervento_id);
        const { error: errInt } = await (patch.azione === 'completa'
          ? query.neq('stato', 'annullato')
          : query.eq('stato', 'completato'));
        if (errInt) console.error('[admin/voce] propagazione intervento fallita:', errInt.message);
        // Positivo appena registrato → sweep delle voci/interventi aperti con lo stesso ODL altrove.
        if (!errInt && patch.azione === 'completa' && patch.esito === 'eseguito_positivo') {
          await sweepDopoPositivi(supabaseAdmin, [v.intervento_id]);
        }
      } catch (e) {
        console.error('[admin/voce] propagazione fallita:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  return NextResponse.json({ ok: true, aggiornate });
}
