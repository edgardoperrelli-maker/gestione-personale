import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { riassumiReport, type ReportAgente } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  let body: ReportAgente;
  try {
    body = (await req.json()) as ReportAgente;
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido.' }, { status: 400 });
  }

  try {
    const r = riassumiReport(body);
    const now = new Date();
    const tipo = typeof body.tipo === 'string' ? body.tipo : 'sync';

    const { error: insErr } = await supabaseAdmin.from('agente_run').insert({
      dry_run: body.dryRun === true,
      lavori: r.lavori,
      aggiornate: r.aggiornate,
      extra: r.extra,
      conflitti: r.conflitti,
      non_collocate: r.nonCollocate,
      errore: body.erroreGlobale ?? null,
      dettaglio: body,
      tipo,
    });
    if (insErr) throw insErr;

    await supabaseAdmin
      .from('agente_config')
      .update({ ultimo_giro_il: now.toISOString() })
      .eq('id', 1);

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore report.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
