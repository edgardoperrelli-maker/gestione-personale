import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id, stato, data').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  const { error } = await supabaseAdmin.from('rapportini').update({ stato: 'inviato', submitted_at: new Date().toISOString() }).eq('id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unificazione: alla consegna del rapportino, chiudi gli interventi collegati alle voci
  // (la torre/agenda li vedono come completati). Gli annullati restano tali.
  const { data: voci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id')
    .eq('rapportino_id', rap.id);
  const interventoIds = ((voci ?? []) as Array<{ intervento_id: string | null }>)
    .map((v) => v.intervento_id)
    .filter((x): x is string => !!x);
  if (interventoIds.length) {
    await supabaseAdmin
      .from('interventi')
      .update({ stato: 'completato', esito: 'eseguito_positivo', chiuso_at: new Date().toISOString() })
      .in('id', interventoIds)
      .neq('stato', 'annullato');
  }

  return NextResponse.json({ ok: true });
}
