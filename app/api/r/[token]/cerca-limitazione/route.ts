import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';

export const runtime = 'nodejs';

const COMMITTENTE_LIMITAZIONE = 'acea';
const CAMPI = 'id, matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

type RigaRef = {
  id: number; matricola: string; pdr: string | null; nominativo: string | null;
  indirizzo: string | null; civico: string | null; comune: string | null; cap: string | null;
};

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

  // 2) nessun esatto → suggerimenti simili (bidirezionali):
  //    (a) pre-filtro SQL ilike '%q%' = "candidato contiene q": robusto anche su dataset grandi
  //        (caso del prefisso variabile, es. q=A023041 trova 99A023041).
  //    (b) campione ordinato del dataset acea (fino a 2000) per il caso inverso "q contiene candidato".
  //    La pura matricoleSimili decide ordine e taglio a 8 sull'unione deduplicata per id.
  const [resLike, resSample] = await Promise.all([
    supabaseAdmin.from('limitazione_misuratori_ref').select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE).ilike('matricola', `%${escLike(q)}%`).limit(50),
    supabaseAdmin.from('limitazione_misuratori_ref').select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE).order('matricola', { ascending: true }).limit(2000),
  ]);
  const perId = new Map<number, RigaRef>();
  for (const r of ([...(resLike.data ?? []), ...(resSample.data ?? [])] as RigaRef[])) perId.set(r.id, r);
  const suggerimenti = matricoleSimili(q, [...perId.values()], 8);
  return NextResponse.json({ trovato: false, suggerimenti });
}
