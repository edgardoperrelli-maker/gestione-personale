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

    const { data: runRow, error: insErr } = await supabaseAdmin.from('agente_run').insert({
      dry_run: body.dryRun === true,
      lavori: r.lavori,
      aggiornate: r.aggiornate,
      extra: r.extra,
      conflitti: r.conflitti,
      non_collocate: r.nonCollocate,
      errore: body.erroreGlobale ?? null,
      dettaglio: body,
      tipo,
    }).select('id').single();
    if (insErr) throw insErr;
    const runId = (runRow as { id: string } | null)?.id ?? null;

    // Giro di assegnazione su ACEA: traccia per-ODL nel log (idempotenza + storico).
    const bodyAssegna = body as unknown as {
      data?: string;
      righe?: Array<{ odl?: string; matricola?: string; comune?: string; staffId?: string; operatoreAcea?: string; interventoId?: string; esito?: string; motivo?: string }>;
    };
    if (tipo === 'acea-assegna' && Array.isArray(bodyAssegna.righe) && bodyAssegna.data) {
      const logRows = bodyAssegna.righe
        .filter((x) => x && typeof x.odl === 'string' && x.odl)
        .map((x) => ({
          data_assegnazione: bodyAssegna.data,
          odl: x.odl as string,
          matricola: x.matricola ?? null,
          comune: x.comune ?? null,
          staff_id: x.staffId ?? null,
          operatore_acea: x.operatoreAcea ?? null,
          intervento_id: x.interventoId ?? null,
          esito: x.esito ?? 'fallito',
          motivo: x.motivo ?? null,
          dry_run: body.dryRun === true,
          run_id: runId,
        }));
      if (logRows.length > 0) {
        const { error: eLog } = await supabaseAdmin.from('acea_assegnazioni_log').insert(logRows);
        if (eLog) console.error('[report] acea_assegnazioni_log insert:', eLog.message);
      }
    }

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
