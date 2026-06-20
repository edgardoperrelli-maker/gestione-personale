// app/api/admin/agente/acea-stato/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // target: 'dunning' (LIMITAZIONI CON ORDINE) | 'zagarolo' (LIMITAZIONI MASSIVE)
  let target: 'dunning' | 'zagarolo' = 'dunning';
  try {
    const body = (await req.json()) as { target?: string };
    if (body?.target === 'zagarolo') target = 'zagarolo';
  } catch {
    // body assente → default dunning
  }

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ forza_acea_stato: true, acea_target: target, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, target });
}
