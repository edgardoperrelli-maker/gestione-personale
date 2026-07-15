// app/api/admin/agente/acea-stato/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { comuniMaster, TARGET_DUNNING, TARGET_TUTTI, type FileMaster } from '@/lib/agente/comuni';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // target: 'dunning' (LIMITAZIONI CON ORDINE) | 'TUTTI' | '<COMUNE>' (LIMITAZIONI MASSIVE).
  // Un target sconosciuto è un 400: scrivere sul master sbagliato è peggio che non scrivere.
  let grezzo: unknown = TARGET_DUNNING;
  try {
    const body = (await req.json()) as { target?: unknown };
    if (body?.target !== undefined && body?.target !== null) grezzo = body.target;
  } catch {
    // body assente → default dunning
  }

  if (typeof grezzo !== 'string') {
    return NextResponse.json({ error: 'Target non valido.' }, { status: 400 });
  }

  let target: string;
  const normalizzato = grezzo.trim().toUpperCase();
  if (grezzo.trim().toLowerCase() === TARGET_DUNNING) {
    target = TARGET_DUNNING;
  } else if (normalizzato === TARGET_TUTTI) {
    target = TARGET_TUTTI;
  } else {
    const { data: masters, error: mastersErr } = await supabaseAdmin
      .from('agente_file_colonne')
      .select('file, is_master')
      .eq('is_master', true);
    if (mastersErr) return NextResponse.json({ error: mastersErr.message }, { status: 500 });
    const noti = comuniMaster((masters ?? []) as FileMaster[]);
    if (!noti.includes(normalizzato)) {
      return NextResponse.json(
        {
          error: `Target non riconosciuto: "${grezzo}". Ammessi: dunning, TUTTI${noti.length > 0 ? `, ${noti.join(', ')}` : ''}.`,
        },
        { status: 400 },
      );
    }
    target = normalizzato;
  }

  const { error } = await supabaseAdmin
    .from('agente_config')
    .update({ forza_acea_stato: true, acea_target: target, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, target });
}
