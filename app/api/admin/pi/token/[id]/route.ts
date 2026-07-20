import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { dataInRoma, addGiorni } from '@/utils/rapportini/scadenza';

export const runtime = 'nodejs';

/** PATCH: toggle "Apri/Chiudi" di un link P.I. La validità è governata SOLO da valido_al
 *  (revocato_at non usato).
 *  - chiudi → valido_al = ieri (Europe/Rome) → il link risulta "Scaduto", niente più "+".
 *  - apri   → valido_al = data scelta (default +7 da oggi), riaperto_at = now → torna valido.
 *  valido_dal resta invariato salvo l'edge (link che parte oggi/nel futuro) dove va allineato
 *  per non violare il CHECK (valido_al >= valido_dal). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { azione?: string; valido_al?: string };

  const { data: tok } = await supabaseAdmin
    .from('pi_token')
    .select('id, valido_dal, valido_al')
    .eq('id', id)
    .maybeSingle();
  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const oggi = dataInRoma(new Date().toISOString());
  const patch: Record<string, unknown> = {};

  if (body.azione === 'chiudi') {
    const ieri = addGiorni(oggi, -1);
    patch.valido_al = ieri;
    // Edge: link che parte oggi o nel futuro → ieri < valido_dal violerebbe il CHECK;
    // allineo anche valido_dal così il link risulta comunque chiuso (scaduto/non attivo).
    if (ieri < tok.valido_dal) patch.valido_dal = ieri;
  } else if (body.azione === 'apri') {
    const nuovoAl = String(body.valido_al ?? '').trim() || addGiorni(oggi, 7);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuovoAl)) {
      return NextResponse.json({ error: 'data_non_valida' }, { status: 422 });
    }
    if (nuovoAl < oggi) return NextResponse.json({ error: 'data_nel_passato', dettaglio: 'La riapertura deve arrivare almeno a oggi.' }, { status: 422 });
    if (nuovoAl < tok.valido_dal) return NextResponse.json({ error: 'valido_al_prima_di_dal' }, { status: 422 });
    patch.valido_al = nuovoAl;
    patch.riaperto_at = new Date().toISOString();
  } else {
    return NextResponse.json({ error: 'azione_non_valida' }, { status: 422 });
  }

  const { error } = await supabaseAdmin.from('pi_token').update(patch).eq('id', id);
  if (error) {
    // 23505 = violazione dell'unique (area_codice, valido_dal, valido_al).
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'periodo_duplicato', dettaglio: 'Esiste già un link con questo periodo per la foglia.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, valido_al: patch.valido_al });
}
