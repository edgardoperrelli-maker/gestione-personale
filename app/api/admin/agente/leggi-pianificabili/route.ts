import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  let body: { data?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const data = String(body.data ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ pianifica_data: data, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
