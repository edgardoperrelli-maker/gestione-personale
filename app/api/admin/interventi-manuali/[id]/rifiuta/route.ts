import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { motivo?: string };
  const motivo = (body.motivo ?? '').trim();

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (richiesta.stato !== 'in_attesa')
    return NextResponse.json({ error: 'gia_decisa' }, { status: 409 });

  const decisoAt = new Date().toISOString();
  const { error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ stato: 'rifiutato', motivo_rifiuto: motivo || null, deciso_da: user.id, deciso_at: decisoAt })
    .eq('id', id);
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ approvazione_stato: 'rifiutato' })
      .eq('id', richiesta.voce_id);
  }
  return NextResponse.json({ ok: true });
}
