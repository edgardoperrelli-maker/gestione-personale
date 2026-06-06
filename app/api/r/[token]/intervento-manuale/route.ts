import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import { buildVoceManuale } from '@/lib/interventi/manuali/buildVoceManuale';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';
import { anagraficaValida } from '@/lib/interventi/manuali/anagraficaValida';

export const runtime = 'nodejs';

const COMMITTENTI: CommittenteManuale[] = ['acea', 'italgas', 'altro'];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, staff_name, data, piano_id, stato, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const body = (await req.json()) as Partial<DatiInterventoManuale> & { note?: string };
  const committente = body.committente as CommittenteManuale | undefined;
  if (!committente || !COMMITTENTI.includes(committente))
    return NextResponse.json({ error: 'committente_non_valido' }, { status: 400 });

  const anagrafica = body.anagrafica ?? {};
  if (!anagraficaValida(anagrafica))
    return NextResponse.json(
      { error: 'campi_mancanti', dettaglio: 'Indicare almeno un identificativo (PDR, ODL o matricola) e almeno un campo indirizzo (via o comune).' },
      { status: 422 },
    );

  const dati: DatiInterventoManuale = {
    committente,
    anagrafica,
    risposte: body.risposte ?? {},
  };

  const { data: templates } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, committente, is_default, active');
  const templateId = risolviTemplateCommittente(committente, (templates ?? []) as TemplateRow[]);
  if (!templateId) return NextResponse.json({ error: 'template_mancante' }, { status: 409 });

  const { data: req2, error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .insert({
      rapportino_id: rap.id,
      piano_id: rap.piano_id,
      staff_id: rap.staff_id,
      staff_name: rap.staff_name,
      committente,
      template_id: templateId,
      data: rap.data,
      dati_operatore: dati,
      dati_correnti: dati,
      note: body.note ?? null,
      stato: 'in_attesa',
      corsia: 'normale',
    })
    .select('id')
    .single();
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  const { data: maxRow } = await supabaseAdmin
    .from('rapportino_voci')
    .select('ordine')
    .eq('rapportino_id', rap.id)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordine = ((maxRow?.ordine as number | undefined) ?? 0) + 1;

  const voce = buildVoceManuale({ rapportinoId: rap.id, richiestaId: req2!.id, ordine, dati });
  const { data: voceRow, error: eVoce } = await supabaseAdmin
    .from('rapportino_voci')
    .insert(voce)
    .select('id')
    .single();
  if (eVoce) return NextResponse.json({ error: eVoce.message }, { status: 500 });

  await supabaseAdmin.from('interventi_manuali').update({ voce_id: voceRow!.id }).eq('id', req2!.id);

  return NextResponse.json({ id: req2!.id, voceId: voceRow!.id });
}
