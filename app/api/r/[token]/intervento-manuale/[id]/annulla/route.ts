import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, rapportino_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta || richiesta.rapportino_id !== rap.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (richiesta.stato !== 'in_attesa')
    return NextResponse.json({ error: 'non_annullabile' }, { status: 409 });

  await supabaseAdmin.from('interventi_manuali').update({ stato: 'annullato' }).eq('id', id);
  if (richiesta.voce_id) {
    await supabaseAdmin.from('rapportino_voci').delete().eq('id', richiesta.voce_id);
  }
  return NextResponse.json({ ok: true });
}
