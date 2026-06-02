import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/apiAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('mappa_assegnazioni_preset')
    .select('id, nome, staff_id, filtro_cap, filtro_attivita, max_interventi')
    .order('nome');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const b = await req.json();
    if (!b?.nome) return NextResponse.json({ error: 'nome obbligatorio' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('mappa_assegnazioni_preset')
      .insert({
        nome: String(b.nome),
        staff_id: b.staffId ?? null,
        filtro_cap: Array.isArray(b.filtroCap) ? b.filtroCap : [],
        filtro_attivita: Array.isArray(b.filtroAttivita) ? b.filtroAttivita : [],
        max_interventi: typeof b.maxInterventi === 'number' ? b.maxInterventi : null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { error } = await supabaseAdmin.from('mappa_assegnazioni_preset').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
