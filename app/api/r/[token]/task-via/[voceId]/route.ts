import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/** Interventi "+" creati per un task-via (parent_voce_id), per il rapportino del token. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; voceId: string }> }) {
  const { token, voceId } = await params;

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, dati_correnti, created_at')
    .eq('rapportino_id', rap.id)
    .eq('parent_voce_id', voceId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = ((data ?? []) as Array<{ id: string; stato: string; dati_correnti: { anagrafica?: Record<string, unknown> } }>).map((r) => ({
    id: r.id,
    stato: r.stato,
    matricola: String(r.dati_correnti?.anagrafica?.matricola ?? ''),
    via: String(r.dati_correnti?.anagrafica?.via ?? ''),
  }));
  return NextResponse.json({ interventi: out });
}
