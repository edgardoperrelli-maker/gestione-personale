import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/** GET ?area=: listino di una foglia. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const area = new URL(req.url).searchParams.get('area');
  if (!area) return NextResponse.json({ error: 'area_mancante' }, { status: 422 });
  const { data, error } = await supabaseAdmin
    .from('pi_articoli')
    .select('area_codice, codice, descrizione, unita_misura, prezzo_unitario, attivo, ordine')
    .eq('area_codice', area)
    .order('ordine');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articoli: data ?? [] });
}

/** POST: nuovo articolo (upsert sulla PK composita area+codice). */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json()) as {
    area_codice?: string; codice?: string; descrizione?: string; unita_misura?: string; prezzo_unitario?: number; ordine?: number;
  };
  if (!b.area_codice || !b.codice) return NextResponse.json({ error: 'parametri_non_validi' }, { status: 422 });
  const { error } = await supabaseAdmin.from('pi_articoli').upsert({
    area_codice: b.area_codice,
    codice: b.codice,
    descrizione: b.descrizione ?? null,
    unita_misura: b.unita_misura ?? null,
    prezzo_unitario: Number(b.prezzo_unitario ?? 0),
    ordine: Number(b.ordine ?? 0),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PATCH: aggiorna campi di un articolo (prezzo/descrizione/U.M./attivo). */
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json()) as {
    area_codice?: string; codice?: string; descrizione?: string; unita_misura?: string; prezzo_unitario?: number; attivo?: boolean; ordine?: number;
  };
  if (!b.area_codice || !b.codice) return NextResponse.json({ error: 'parametri_non_validi' }, { status: 422 });
  const patch: Record<string, unknown> = {};
  if (b.descrizione !== undefined) patch.descrizione = b.descrizione;
  if (b.unita_misura !== undefined) patch.unita_misura = b.unita_misura;
  if (b.prezzo_unitario !== undefined) patch.prezzo_unitario = Number(b.prezzo_unitario);
  if (b.attivo !== undefined) patch.attivo = b.attivo;
  if (b.ordine !== undefined) patch.ordine = Number(b.ordine);
  const { error } = await supabaseAdmin
    .from('pi_articoli')
    .update(patch)
    .eq('area_codice', b.area_codice)
    .eq('codice', b.codice);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
