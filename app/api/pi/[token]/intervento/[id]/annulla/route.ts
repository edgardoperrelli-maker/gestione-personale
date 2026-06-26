import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/** Annulla una richiesta P.I. dell'operatore finché è ancora in_attesa.
 *  Vincolato al proprio token (la richiesta deve appartenere a quel pi_token). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;

  const { data: tok } = await supabaseAdmin.from('pi_token').select('id').eq('token', token).maybeSingle();
  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: upd } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ stato: 'annullato' })
    .eq('id', id)
    .eq('pi_token_id', tok.id)
    .eq('fonte', 'pronto_intervento')
    .eq('stato', 'in_attesa')
    .select('id')
    .maybeSingle();

  if (!upd) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });
  return NextResponse.json({ ok: true, id: upd.id });
}
