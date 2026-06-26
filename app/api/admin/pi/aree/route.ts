import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** GET: foglie territoriali (per i tab del modulo). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('pi_aree')
    .select('codice, label, attiva, ordine')
    .order('ordine');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aree: data ?? [] });
}
