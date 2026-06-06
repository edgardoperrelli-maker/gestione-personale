import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseFiltroLista } from '@/lib/interventi/manuali/listaQuery';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const filtro = parseFiltroLista(new URL(req.url).searchParams);
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, rapportino_id, voce_id, intervento_id, staff_id, staff_name, committente, data, stato, corsia, dati_operatore, dati_correnti, note, motivo_rifiuto, created_at, preso_in_carico_da, preso_in_carico_at')
    .order('created_at', { ascending: false });

  if (filtro.stato) q = q.eq('stato', filtro.stato);
  if (filtro.from) q = q.gte('data', filtro.from);
  if (filtro.to) q = q.lte('data', filtro.to);
  if (filtro.staff) q = q.eq('staff_id', filtro.staff);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ richieste: data ?? [] });
}
