import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH: accende/spegne un master (`{ attivo: boolean }`). Spento = fuori dal template. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: { attivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido.' }, { status: 400 });
  }
  if (typeof body.attivo !== 'boolean') {
    return NextResponse.json({ error: 'Campo "attivo" (boolean) obbligatorio.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('template_master')
    .update({ attivo: body.attivo })
    .eq('id', id)
    .select('id, attivo')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Master non trovato.' }, { status: 404 });
  return NextResponse.json({ ok: true, attivo: (data as { attivo: boolean }).attivo });
}

/** DELETE: elimina il master e le sue righe (cascade). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const { error } = await supabaseAdmin.from('template_master').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
