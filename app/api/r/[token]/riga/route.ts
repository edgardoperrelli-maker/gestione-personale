import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { maiuscolo } from '@/lib/testo/maiuscolo';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const body = (await req.json()) as {
    voceId?: string; rigaId?: string;
    matricola?: string; pdr?: string; nominativo?: string;
    risposte?: Record<string, unknown>; creato_da?: string;
    fonte?: 'civico' | 'fuori_elenco' | 'manuale'; ref_id?: number | null;
  };

  // UPDATE riga esistente (merge risposte + anagrafica).
  if (body.rigaId) {
    const { data: riga } = await supabaseAdmin
      .from('rapportino_righe')
      .select('id, risposte')
      .eq('id', body.rigaId)
      .eq('rapportino_id', rap.id)
      .maybeSingle();
    if (!riga) return NextResponse.json({ error: 'riga_non_valida' }, { status: 400 });
    const risposte = { ...((riga.risposte as Record<string, unknown> | null) ?? {}), ...(body.risposte ?? {}) };
    const patch: Record<string, unknown> = { risposte };
    // DB pulito: anagrafica sempre in MAIUSCOLO (le risposte foto sono path: non vanno toccate).
    if (body.matricola !== undefined) patch.matricola = maiuscolo(body.matricola);
    if (body.pdr !== undefined) patch.pdr = maiuscolo(body.pdr);
    if (body.nominativo !== undefined) patch.nominativo = maiuscolo(body.nominativo);
    const { data: upd, error } = await supabaseAdmin
      .from('rapportino_righe').update(patch).eq('id', body.rigaId)
      .select('id, voce_id, matricola, pdr, nominativo, risposte, ordine, fonte').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ riga: upd });
  }

  // INSERT nuova riga (manuale).
  if (!body.voceId || !body.matricola || !body.matricola.trim())
    return NextResponse.json({ error: 'voceId e matricola obbligatori' }, { status: 422 });
  // Verifica che la voce appartenga al rapportino.
  const { data: voce } = await supabaseAdmin
    .from('rapportino_voci').select('id').eq('id', body.voceId).eq('rapportino_id', rap.id).maybeSingle();
  if (!voce) return NextResponse.json({ error: 'voce_non_valida' }, { status: 400 });
  // ordine = max+1 per quella voce.
  const { data: maxRow } = await supabaseAdmin
    .from('rapportino_righe').select('ordine').eq('voce_id', body.voceId)
    .order('ordine', { ascending: false }).limit(1).maybeSingle();
  const ordine = ((maxRow?.ordine as number | undefined) ?? 0) + 1;
  const { data: ins, error } = await supabaseAdmin
    .from('rapportino_righe').insert({
      id: randomUUID(), voce_id: body.voceId, rapportino_id: rap.id,
      matricola: maiuscolo(body.matricola.trim()), pdr: maiuscolo(body.pdr ?? null), nominativo: maiuscolo(body.nominativo ?? null),
      ref_id: body.ref_id ?? null,
      fonte: body.fonte === 'civico' || body.fonte === 'fuori_elenco' ? body.fonte : 'manuale',
      risposte: body.risposte ?? {}, ordine, creato_da: body.creato_da ?? null,
    })
    .select('id, voce_id, matricola, pdr, nominativo, risposte, ordine, fonte').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ riga: ins });
}

// Elimina una riga-misuratore (figlia di una voce-civico) del rapportino.
export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { rigaId?: string };
  if (!body.rigaId) return NextResponse.json({ error: 'rigaId obbligatorio' }, { status: 422 });

  const { error } = await supabaseAdmin
    .from('rapportino_righe')
    .delete()
    .eq('id', body.rigaId)
    .eq('rapportino_id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
