import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseFiltriRef, type FiltriRef } from '@/lib/risanamento/filtriRef';

export const runtime = 'nodejs';

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

/** Applica i filtri a una query builder Supabase su risanamento_misuratori_ref. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applica(q: any, f: FiltriRef): any {
  let out = q;
  if (f.indirizzo) out = out.ilike('indirizzo', `%${escLike(f.indirizzo)}%`);
  if (f.civico) out = out.eq('civico', f.civico);
  if (f.comune) out = out.ilike('comune', `%${escLike(f.comune)}%`);
  if (f.import_id) out = out.eq('import_id', f.import_id);
  return out;
}

/** GET: conteggio + campione (max 50) delle righe di riferimento che matchano i filtri. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const f = parseFiltriRef(new URL(req.url).searchParams);
  const base = supabaseAdmin
    .from('risanamento_misuratori_ref')
    .select('id, matricola, pdr, nominativo, indirizzo, civico, comune', { count: 'exact' });
  const { data, count, error } = await applica(base, f).order('indirizzo', { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0, sample: data ?? [] });
}

/** DELETE: elimina le righe di riferimento che matchano i filtri (almeno un filtro obbligatorio). */
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const f = parseFiltriRef(new URL(req.url).searchParams);
  if (f.vuoto) {
    return NextResponse.json({ error: 'Specifica almeno un filtro: la cancellazione totale non è ammessa.' }, { status: 400 });
  }
  // Conta prima: count:'exact' su DELETE non è affidabile su tutti i setup PostgREST.
  const head = supabaseAdmin.from('risanamento_misuratori_ref').select('id', { count: 'exact', head: true });
  const { count: nMatch, error: eCount } = await applica(head, f);
  if (eCount) return NextResponse.json({ error: eCount.message }, { status: 500 });
  const { error } = await applica(supabaseAdmin.from('risanamento_misuratori_ref').delete(), f);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ eliminati: nMatch ?? 0 });
}
