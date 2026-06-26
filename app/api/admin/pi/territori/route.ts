import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** GET ?area=: elenco territori + quelli associati alla foglia. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const area = new URL(req.url).searchParams.get('area');
  if (!area) return NextResponse.json({ error: 'area_mancante' }, { status: 422 });

  const { data: territories } = await supabaseAdmin
    .from('territories')
    .select('id, name')
    .order('name', { ascending: true });
  const { data: mappati } = await supabaseAdmin
    .from('pi_aree_territori')
    .select('territory_id')
    .eq('area_codice', area);

  return NextResponse.json({
    territories: territories ?? [],
    selected: ((mappati ?? []) as Array<{ territory_id: string }>).map((r) => r.territory_id),
  });
}

/** PUT: sostituisce i territori associati alla foglia. */
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json()) as { area_codice?: string; territory_ids?: string[] };
  const area = String(b.area_codice ?? '').trim();
  if (!area) return NextResponse.json({ error: 'area_mancante' }, { status: 422 });
  const ids = Array.isArray(b.territory_ids) ? b.territory_ids.filter((x) => typeof x === 'string') : [];

  await supabaseAdmin.from('pi_aree_territori').delete().eq('area_codice', area);
  if (ids.length > 0) {
    const rows = ids.map((territory_id) => ({ area_codice: area, territory_id }));
    const { error } = await supabaseAdmin.from('pi_aree_territori').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
