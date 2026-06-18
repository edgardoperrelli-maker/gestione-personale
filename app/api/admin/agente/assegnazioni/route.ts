import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data');

  let q = supabaseAdmin
    .from('assegnazione_ai_log')
    .select('data_pianificata, comune, file, staff_name, n_interventi, creato_il')
    .order('creato_il', { ascending: false })
    .limit(100);
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) q = q.eq('data_pianificata', data);

  const { data: righe, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ righe: righe ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
