import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { richiestaPiToIntervento } from '@/lib/pi/richiestaPiToIntervento';
import type { DatiInterventoManuale } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

/** Approva una richiesta P.I.: check-and-set atomico → crea l'intervento canonico
 *  (origine='pronto_intervento'). Compensazione su errore (no transazione DB). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const { data: rich } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, fonte, data, staff_id, dati_correnti')
    .eq('id', id)
    .eq('fonte', 'pronto_intervento')
    .maybeSingle();
  if (!rich) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ stato: 'approvato', deciso_da: user.id, deciso_at: new Date().toISOString() })
    .eq('id', id)
    .eq('stato', 'in_attesa')
    .select('id')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });

  const record = richiestaPiToIntervento(rich.dati_correnti as DatiInterventoManuale, {
    data: rich.data as string,
    staff_id: String(rich.staff_id ?? ''),
  });

  const { data: intRow, error: eInt } = await supabaseAdmin
    .from('interventi')
    .insert(record)
    .select('id')
    .single();
  if (eInt) {
    // Compensazione: ripristina lo stato così la richiesta torna ri-approvabile.
    await supabaseAdmin.from('interventi_manuali').update({ stato: 'in_attesa', deciso_da: null, deciso_at: null }).eq('id', id);
    return NextResponse.json({ error: eInt.message }, { status: 500 });
  }

  await supabaseAdmin.from('interventi_manuali').update({ intervento_id: intRow!.id }).eq('id', id);
  return NextResponse.json({ ok: true, interventoId: intRow!.id });
}
