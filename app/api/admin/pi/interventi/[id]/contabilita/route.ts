import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// [id] = intervento_id della riga P.I. approvata.

async function areaDellIntervento(interventoId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('interventi_manuali')
    .select('area_codice')
    .eq('intervento_id', interventoId)
    .eq('fonte', 'pronto_intervento')
    .maybeSingle();
  return (data?.area_codice as string | null) ?? null;
}

/** GET: listino della foglia + righe di contabilità già salvate. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const area = await areaDellIntervento(id);
  if (!area) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: listino } = await supabaseAdmin
    .from('pi_articoli')
    .select('codice, descrizione, unita_misura, prezzo_unitario, attivo, ordine')
    .eq('area_codice', area)
    .order('ordine');
  const { data: righe } = await supabaseAdmin
    .from('pi_contabilita_righe')
    .select('id, articolo_codice, quantita, prezzo_snapshot, unita_misura, valore')
    .eq('intervento_id', id);

  return NextResponse.json({ area_codice: area, listino: listino ?? [], righe: righe ?? [] });
}

/** PUT: sostituisce le righe di contabilità (congela prezzo/unità dal listino). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const area = await areaDellIntervento(id);
  if (!area) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = (await req.json()) as { righe?: Array<{ articolo_codice: string; quantita: number }> };
  const input = (body.righe ?? []).filter((r) => r.articolo_codice && Number(r.quantita) > 0);

  const { data: listino } = await supabaseAdmin
    .from('pi_articoli')
    .select('codice, prezzo_unitario, unita_misura')
    .eq('area_codice', area);
  const prezzi = new Map((listino ?? []).map((a) => [a.codice as string, a]));

  // Replace: cancella e reinserisce (snapshot prezzo dal listino corrente).
  await supabaseAdmin.from('pi_contabilita_righe').delete().eq('intervento_id', id);

  const da_inserire = input
    .map((r) => {
      const art = prezzi.get(r.articolo_codice);
      if (!art) return null;
      return {
        intervento_id: id,
        area_codice: area,
        articolo_codice: r.articolo_codice,
        quantita: Number(r.quantita),
        prezzo_snapshot: Number(art.prezzo_unitario),
        unita_misura: (art.unita_misura as string | null) ?? null,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (da_inserire.length > 0) {
    const { error } = await supabaseAdmin.from('pi_contabilita_righe').insert(da_inserire);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: righe } = await supabaseAdmin
    .from('pi_contabilita_righe')
    .select('id, articolo_codice, quantita, prezzo_snapshot, unita_misura, valore')
    .eq('intervento_id', id);
  const totale = Math.round((righe ?? []).reduce((s, r) => s + Number(r.valore ?? 0), 0) * 100) / 100;
  return NextResponse.json({ ok: true, righe: righe ?? [], totale });
}
