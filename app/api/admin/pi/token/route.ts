import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { generaAgendaToken } from '@/lib/interventi/agendaToken';

export const runtime = 'nodejs';

/** GET: elenco link P.I. (filtrabile per area). */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const area = new URL(req.url).searchParams.get('area');
  let q = supabaseAdmin
    .from('pi_token')
    .select('id, area_codice, template_id, valido_dal, valido_al, token, note, revocato_at, created_at')
    .order('valido_dal', { ascending: false });
  if (area) q = q.eq('area_codice', area);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token: data ?? [] });
}

/** POST: genera (o riusa) il link condiviso per area + periodo. Idempotente sull'unique
 *  (area_codice, valido_dal, valido_al). Default template = "Pronto Intervento". */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const body = (await req.json()) as { area_codice?: string; valido_dal?: string; valido_al?: string; template_id?: string | null; note?: string };

  const area_codice = String(body.area_codice ?? '').trim();
  const valido_dal = String(body.valido_dal ?? '').trim();
  const valido_al = String(body.valido_al ?? '').trim();
  if (!area_codice || !/^\d{4}-\d{2}-\d{2}$/.test(valido_dal) || !/^\d{4}-\d{2}-\d{2}$/.test(valido_al) || valido_al < valido_dal) {
    return NextResponse.json({ error: 'parametri_non_validi' }, { status: 422 });
  }

  // Riuso se esiste già un link per area+periodo.
  const { data: gia } = await supabaseAdmin
    .from('pi_token')
    .select('id, token')
    .eq('area_codice', area_codice)
    .eq('valido_dal', valido_dal)
    .eq('valido_al', valido_al)
    .maybeSingle();
  if (gia) return NextResponse.json({ id: gia.id, token: gia.token, riusato: true });

  // Template: esplicito o default "Pronto Intervento".
  let templateId = body.template_id ?? null;
  let campiSnapshot: unknown[] = [];
  if (!templateId) {
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('id, campi').eq('nome', 'Pronto Intervento').maybeSingle();
    templateId = tpl?.id ?? null;
    campiSnapshot = (tpl?.campi ?? []) as unknown[];
  } else {
    const { data: tpl } = await supabaseAdmin.from('rapportino_template').select('campi').eq('id', templateId).maybeSingle();
    campiSnapshot = (tpl?.campi ?? []) as unknown[];
  }

  const token = generaAgendaToken();
  const { data: row, error } = await supabaseAdmin
    .from('pi_token')
    .insert({
      area_codice,
      template_id: templateId,
      campi_snapshot: campiSnapshot,
      valido_dal,
      valido_al,
      token,
      note: body.note ?? null,
      creato_da: user.id,
    })
    .select('id, token')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: row!.id, token: row!.token });
}
