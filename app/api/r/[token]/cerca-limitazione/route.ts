import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';

export const runtime = 'nodejs';

const COMMITTENTE_LIMITAZIONE = 'acea';
const CAMPI = 'id, matricola, pdr, nominativo, indirizzo, civico, comune, cap';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q obbligatorio' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  // 1) match esatto
  const { data: esatti } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select(CAMPI)
    .eq('committente', COMMITTENTE_LIMITAZIONE)
    .eq('matricola', q)
    .limit(1);
  if (esatti && esatti.length > 0) {
    return NextResponse.json({ trovato: true, misuratore: esatti[0] });
  }

  // 2) nessun esatto → suggerimenti simili (bidirezionali) sul dataset committente=acea.
  //    Dataset per comune limitato (poche migliaia di righe): carichiamo fino a 2000 e filtriamo con la pura.
  const { data: rows } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select(CAMPI)
    .eq('committente', COMMITTENTE_LIMITAZIONE)
    .limit(2000);
  const suggerimenti = matricoleSimili(q, (rows ?? []) as Array<{ matricola: string }>, 8);
  return NextResponse.json({ trovato: false, suggerimenti });
}
