import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { patchInterventoLiveDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { voceId, risposte } = await req.json();
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, campi_snapshot')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id')
    .eq('id', voceId)
    .eq('rapportino_id', rap.id)
    .maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Propagazione live: l'intervento collegato riflette SUBITO lo stato della voce.
  // Un errore qui NON deve far fallire l'autosave (la voce è la fonte di verità;
  // l'invio finale riapplica comunque gli esiti).
  const interventoId = (voce as { intervento_id: string | null }).intervento_id;
  if (interventoId) {
    const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
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

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
