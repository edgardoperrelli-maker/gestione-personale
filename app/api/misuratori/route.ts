import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

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
