// app/api/admin/agente/esegui-ora/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { normalizzaComune, TARGET_TUTTI, type FileMaster } from '@/lib/agente/comuni';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Body opzionale { comune }: filtro one-shot per QUESTO giro manuale (null = tutti i comuni).
  // Body assente/non-JSON → null (retro-compatibile con il vecchio POST senza body).
  let richiesto: unknown = null;
  try {
    const body = (await req.json()) as { comune?: unknown };
    richiesto = body?.comune ?? null;
  } catch {
    richiesto = null;
  }

  // I master servono solo per validare un comune vero: "tutti i comuni" non li interroga.
  let masters: FileMaster[] = [];
  if (typeof richiesto === 'string' && richiesto.trim() !== '' && richiesto.trim().toUpperCase() !== TARGET_TUTTI) {
    const { data, error: mastersErr } = await supabaseAdmin
      .from('agente_file_colonne')
      .select('file, is_master')
      .eq('is_master', true);
    if (mastersErr) return NextResponse.json({ error: mastersErr.message }, { status: 500 });
    masters = (data ?? []) as FileMaster[];
  }

  const esito = normalizzaComune(richiesto, masters);
  if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({
      forza_giro: true,
      forza_giro_comune: esito.comune,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, comune: esito.comune });
}
