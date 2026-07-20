import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** POST: riapre un rapportino P.I. (approvato o rifiutato) → torna `in_attesa` nella coda.
 *  Riusa lo stato esistente: da lì l'operatore può ri-modificare (con link aperto) e
 *  l'ufficio ri-approva col flusso normale.
 *  - approvato: elimina l'intervento canonico (cascade su pi_contabilita_righe) e scollega;
 *    la contabilità già inserita va rifatta dopo la ri-approvazione.
 *  - rifiutato: azzera il motivo. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: rich } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, fonte, intervento_id')
    .eq('id', id)
    .eq('fonte', 'pronto_intervento')
    .maybeSingle();
  if (!rich) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (rich.stato !== 'approvato' && rich.stato !== 'rifiutato') {
    return NextResponse.json({ error: 'stato_non_riapribile' }, { status: 409 });
  }

  // Check-and-set sullo stato di partenza → in_attesa (idempotente contro doppi click).
  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ stato: 'in_attesa', deciso_da: null, deciso_at: null, motivo_rifiuto: null, intervento_id: null })
    .eq('id', id)
    .eq('stato', rich.stato)
    .select('id')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });

  // Era approvato: rimuovi l'intervento canonico (le righe di contabilità cascadano).
  if (rich.stato === 'approvato' && rich.intervento_id) {
    await supabaseAdmin.from('interventi').delete().eq('id', rich.intervento_id);
  }
  return NextResponse.json({ ok: true });
}
