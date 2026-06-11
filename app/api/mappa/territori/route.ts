import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { data } = await supabaseAdmin
    .from('territories')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  return NextResponse.json((data ?? []) as Array<{ id: string; name: string }>);
}
