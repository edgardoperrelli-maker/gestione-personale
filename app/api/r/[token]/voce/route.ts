import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { voceId, risposte } = await req.json();
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, campi_snapshot, staff_id')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id, raw_json')
    .eq('id', voceId)
    .eq('rapportino_id', rap.id)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Propagazione live (best-effort: un errore qui NON deve far fallire l'autosave;
  // la voce è la fonte di verità e l'esito viene riapplicato anche all'invio/risincronizza).
  try {
    const vAny = voce as { intervento_id: string | null; raw_json: unknown };
    const rapAny = rap as { campi_snapshot: unknown; data: string; staff_id: string | null };
    let interventoId = vAny.intervento_id;

    // Auto-aggancio: se la voce è scollegata, la collega al volo (ODL/matricola/PDR)
    // agli interventi dell'operatore in quella data, e persiste il collegamento.
    if (!interventoId) {
      const raw = (vAny.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
      const { data: cand } = await supabaseAdmin
        .from('interventi')
        .select('id, staff_id, odl, matricola_contatore, pdr')
        .eq('staff_id', rapAny.staff_id)
        .eq('data', rapAny.data)
        .neq('stato', 'annullato');
      const resolve = buildVoceInterventoLinker((cand ?? []) as InterventoLinkRow[]);
      const found = resolve({
        staff_id: rapAny.staff_id,
        odl: raw.odl as string | null | undefined,
        odsin: raw.odsin as string | null | undefined,
        matricola: raw.matricola as string | null | undefined,
        pdr: raw.pdr as string | null | undefined,
      });
      if (found) {
        interventoId = found;
        await supabaseAdmin.from('rapportino_voci').update({ intervento_id: found }).eq('id', voceId);
      }
    }

    if (interventoId) {
      const campi = (rapAny.campi_snapshot ?? []) as TemplateCampo[];
      const patch = patchInterventoLiveDaVoce((risposte ?? {}) as Record<string, unknown>, campi);
      // 'completa' chiude l'intervento (qualsiasi stato tranne annullato).
      // 'riapri' annulla SOLO una nostra precedente chiusura: tocca l'intervento
      // solo se è 'completato', così non declassa stati intermedi gestiti da altri flussi.
      const interventoPatch =
        patch.azione === 'completa'
          ? { stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() }
          : { stato: 'assegnato', esito: null, esito_motivo: null, chiuso_at: null };
      const query = supabaseAdmin.from('interventi').update(interventoPatch).eq('id', interventoId);
      const { error: errInt } = await (patch.azione === 'completa'
        ? query.neq('stato', 'annullato')
        : query.eq('stato', 'completato'));
      if (errInt) console.error('[r/voce] propagazione intervento fallita:', errInt.message);
    }
  } catch (e) {
    console.error('[r/voce] propagazione/aggancio fallito:', e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
