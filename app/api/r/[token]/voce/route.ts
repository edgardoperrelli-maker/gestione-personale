import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { voceId, risposte } = await req.json();
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id, stato, expires_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as any, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { data: voce } = await supabaseAdmin.from('rapportino_voci').select('id').eq('id', voceId).eq('rapportino_id', rap.id).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  const { error } = await supabaseAdmin.from('rapportino_voci').update({ risposte }).eq('id', voceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
