import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export const runtime = 'nodejs';

const COMMITTENTE = 'acea';
const PROIEZIONE = 'matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';
const PAGINA = 1000;

/**
 * GET /api/r/[token]/censimento?v=<versione>
 * Cache offline del censimento Acea. La versione è "<count>:<maxId>": un nuovo import
 * alza max(id) → cambia versione. Se la versione del client coincide risponde
 * { unchanged: true } (check giornaliero minuscolo); altrimenti la proiezione completa.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Il token deve essere un link operatore reale (non gate sullo stato: è dato di riferimento).
  const { data: rap } = await supabaseAdmin.from('rapportini').select('id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Versione = count + max(id) del dataset acea.
  const { count } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select('id', { count: 'exact', head: true })
    .eq('committente', COMMITTENTE);
  const { data: maxRow } = await supabaseAdmin
    .from('limitazione_misuratori_ref')
    .select('id')
    .eq('committente', COMMITTENTE)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versione = `${count ?? 0}:${(maxRow as { id: number } | null)?.id ?? 0}`;

  const vClient = new URL(req.url).searchParams.get('v') ?? '';
  if (vClient === versione) return NextResponse.json({ unchanged: true, versione });

  // Fetch completo PAGINATO (PostgREST tronca a 1000).
  const righe: CensitoMisuratore[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('limitazione_misuratori_ref')
      .select(PROIEZIONE)
      .eq('committente', COMMITTENTE)
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    righe.push(...((data ?? []) as CensitoMisuratore[]));
    if (!data || data.length < PAGINA) break;
  }

  return NextResponse.json({ unchanged: false, versione, righe });
}
