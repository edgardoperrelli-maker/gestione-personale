import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** Rifiuta una richiesta P.I. (check-and-set atomico). Motivo opzionale. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { motivo?: string };

  // intervento_id: null esplicito — un rifiuto non deve MAI lasciare (o produrre) un intervento
  // canonico agganciato (stesso principio della lane rapportino, vedi interventi-manuali/rifiuta).
  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      stato: 'rifiutato',
      motivo_rifiuto: body.motivo ?? null,
      deciso_da: user.id,
      deciso_at: new Date().toISOString(),
      intervento_id: null,
    })
    .eq('id', id)
    .eq('fonte', 'pronto_intervento')
    .eq('stato', 'in_attesa')
    .select('id')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
