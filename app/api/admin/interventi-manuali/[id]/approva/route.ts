import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { richiestaToIntervento } from '@/lib/interventi/manuali/richiestaToIntervento';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { dati_correnti?: DatiInterventoManuale };

  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, piano_id, staff_id, data, committente, dati_correnti')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (richiesta.stato !== 'in_attesa')
    return NextResponse.json({ error: 'gia_decisa' }, { status: 409 });

  const dati = (body.dati_correnti ?? richiesta.dati_correnti) as DatiInterventoManuale;
  const committente = (dati.committente ?? richiesta.committente) as CommittenteManuale;

  const record = richiestaToIntervento(dati, {
    committente,
    data: (richiesta.data as string),
    staff_id: String(richiesta.staff_id ?? ''),
    piano_id: (richiesta.piano_id as string | null) ?? null,
  });

  const { data: intRow, error: eInt } = await supabaseAdmin
    .from('interventi')
    .insert(record)
    .select('id')
    .single();
  if (eInt) return NextResponse.json({ error: eInt.message }, { status: 500 });

  const decisoAt = new Date().toISOString();

  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ intervento_id: intRow!.id, approvazione_stato: 'approvato' })
      .eq('id', richiesta.voce_id);
  }

  const { error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      stato: 'approvato',
      dati_correnti: dati,
      intervento_id: intRow!.id,
      deciso_da: user.id,
      deciso_at: decisoAt,
    })
    .eq('id', id);
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  return NextResponse.json({ ok: true, interventoId: intRow!.id });
}
