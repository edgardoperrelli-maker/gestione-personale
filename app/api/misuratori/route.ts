import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

async function requireUser(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: (() => cookieStore) as unknown as () => ReturnType<typeof cookies>,
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  return true;
}

export async function GET(req: Request) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const dataInizio = searchParams.get('data_inizio');
  const dataFine   = searchParams.get('data_fine');
  const stato      = searchParams.get('stato');
  const comune     = searchParams.get('comune');
  const esecutore  = searchParams.get('esecutore');

  let query = supabaseAdmin
    .from('misuratori_rimossi')
    .select('*')
    .order('data_esecuzione', { ascending: false })
    .order('created_at', { ascending: false });

  if (dataInizio) query = query.gte('data_esecuzione', dataInizio);
  if (dataFine)   query = query.lte('data_esecuzione', dataFine);
  if (stato)      query = query.eq('stato', stato);
  if (comune)     query = query.ilike('comune', `%${comune}%`);
  if (esecutore)  query = query.eq('esecutore', esecutore);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
