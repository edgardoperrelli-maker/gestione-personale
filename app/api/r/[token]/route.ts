import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin.from('rapportini')
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, riaperto_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString());
  const { data: voci } = await supabaseAdmin.from('rapportino_voci')
    .select('id, task_id, ordine, nominativo, pdr, via, comune, cap, attivita, fascia_oraria, risposte')
    .eq('rapportino_id', rap.id).order('ordine');
  return NextResponse.json({ rapportino: { ...rap, statoCalcolato: stato }, voci: voci ?? [] });
}
