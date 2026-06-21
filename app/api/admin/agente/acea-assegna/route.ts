// app/api/admin/agente/acea-assegna/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let data = '';
  let dry = true; // default: prudente (dry-run)
  try {
    const body = (await req.json()) as { data?: string; dry?: boolean };
    if (body?.data && /^\d{4}-\d{2}-\d{2}$/.test(body.data)) data = body.data;
    if (body?.dry === false) dry = false;
  } catch { /* body assente */ }
  if (!data) return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ forza_acea_assegna: true, acea_assegna_data: data, acea_assegna_dry: dry, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data, dry });
}
