import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { stessoCivico } from '@/utils/rapportini/matchIndirizzo';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { searchParams } = new URL(req.url);
  const voceId = searchParams.get('voceId') ?? '';
  const codice = (searchParams.get('codice') ?? '').trim();
  if (!voceId || !codice) return NextResponse.json({ error: 'voceId e codice obbligatori' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id, via').eq('id', voceId).eq('rapportino_id', rap.id).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });

  const { data: matches } = await supabaseAdmin
    .from('risanamento_misuratori_ref')
    .select('id, pdr, nominativo, indirizzo')
    .eq('matricola', codice);
  const list = (matches ?? []) as Array<{ id: number; pdr: string | null; nominativo: string | null; indirizzo: string | null }>;
  if (list.length === 0) return NextResponse.json({ trovato: false });

  const via = (voce as { via: string | null }).via;
  const civico = list.find((m) => stessoCivico(via, m.indirizzo));
  const scelto = civico ?? list[0];
  return NextResponse.json({
    trovato: true,
    fonte: civico ? 'civico' : 'fuori_elenco',
    ref_id: scelto.id,
    pdr: scelto.pdr ?? '',
    nominativo: scelto.nominativo ?? '',
    indirizzoRef: civico ? undefined : (scelto.indirizzo ?? ''),
  });
}
