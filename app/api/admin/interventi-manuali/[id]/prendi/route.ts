import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { puoiPrendere } from '@/lib/interventi/manuali/presaInCarico';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { override?: boolean };
  const override = body.override === true;

  // Stato corrente della presa in carico
  const { data: riga, error: selErr } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, preso_in_carico_da')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!riga) return NextResponse.json({ error: 'Richiesta inesistente.' }, { status: 404 });

  if (!puoiPrendere(riga.preso_in_carico_da, user.id, override)) {
    return NextResponse.json({ error: 'gia_in_gestione', da: riga.preso_in_carico_da }, { status: 409 });
  }

  const { error: updErr } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ preso_in_carico_da: user.id, preso_in_carico_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, preso_in_carico_da: user.id });
}
