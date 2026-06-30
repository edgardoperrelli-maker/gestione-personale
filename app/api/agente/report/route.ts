import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { riassumiReport, type ReportAgente } from '@/lib/agente/decisione';
import { normalizzaStatoPortale } from '@/lib/produzione/statoPortale';
import { voceDaAttivita } from '@/lib/produzione/voceDaAttivita';

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

    // Giro "Richiedi stato ACEA" (Dunning/Zagarolo): aggiorna l'assegnatario corrente per-ODL dall'export
    // (pre-marcatura proattiva nell'anteprima). Best-effort: se la tabella non esiste ancora → logga e prosegue.
    const bodyStato = body as unknown as { preassegnati?: Array<{ odl?: string; assegnatario?: string }> };
    if (tipo === 'acea-stato' && Array.isArray(bodyStato.preassegnati) && bodyStato.preassegnati.length > 0) {
      const seen = new Set<string>();
      const preRows = bodyStato.preassegnati
        .filter((x) => x && typeof x.odl === 'string' && x.odl && typeof x.assegnatario === 'string' && x.assegnatario)
        .filter((x) => { const k = x.odl as string; if (seen.has(k)) return false; seen.add(k); return true; })
        .map((x) => ({ odl: x.odl as string, assegnatario: x.assegnatario as string, aggiornato_il: now.toISOString() }));
      if (preRows.length > 0) {
        const { error: ePre } = await supabaseAdmin.from('acea_preassegnati').upsert(preRows, { onConflict: 'odl' });
        if (ePre) console.error('[report] acea_preassegnati upsert:', ePre.message);
      }
    }

    // Snapshot PORTALE ACEA (Produzione economica → SAL/audit): foto corrente ODL→stato dall'export.
    // Tipo-agnostico: si ingerisce ogni report che porta `portaleSnapshot`. Best-effort.
    const bodySnap = body as unknown as {
      portaleSnapshot?: Array<{ odl?: string; stato?: string; operatore?: string }>;
      masterSnapshot?: Array<{
        odl?: string; attivita?: string; esecutore?: string; dataRaw?: string; statoRaw?: string; matricola?: string; comune?: string;
      }>;
    };
    if (Array.isArray(bodySnap.portaleSnapshot) && bodySnap.portaleSnapshot.length > 0) {
      const seen = new Set<string>();
      const rows = bodySnap.portaleSnapshot
        .filter((x) => x && typeof x.odl === 'string' && x.odl && typeof x.stato === 'string')
        .filter((x) => { const k = x.odl as string; if (seen.has(k)) return false; seen.add(k); return true; })
        .map((x) => ({
          odl: x.odl as string,
          stato: x.stato as string,
          stato_norm: normalizzaStatoPortale(x.stato),
          operatore: x.operatore ?? null,
          raccolto_at: now.toISOString(),
          run_id: runId,
        }));
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('acea_portale_snapshot').upsert(rows, { onConflict: 'odl' });
        if (error) console.error('[report] acea_portale_snapshot upsert:', error.message);
      }
    }

    // Snapshot MASTER DUNNING (audit): foto corrente ODL→stato/attività dal master. `voce` derivata.
    if (Array.isArray(bodySnap.masterSnapshot) && bodySnap.masterSnapshot.length > 0) {
      const seen = new Set<string>();
      const rows = bodySnap.masterSnapshot
        .filter((x) => x && typeof x.odl === 'string' && x.odl)
        .filter((x) => { const k = x.odl as string; if (seen.has(k)) return false; seen.add(k); return true; })
        .map((x) => ({
          odl: x.odl as string,
          attivita: x.attivita ?? null,
          voce: voceDaAttivita(x.attivita ?? null),
          esecutore: x.esecutore ?? null,
          data_raw: x.dataRaw ?? null,
          stato_op: x.statoRaw ?? null,
          matricola: x.matricola ?? null,
          comune: x.comune ?? null,
          raccolto_at: now.toISOString(),
          run_id: runId,
        }));
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('acea_master_snapshot').upsert(rows, { onConflict: 'odl' });
        if (error) console.error('[report] acea_master_snapshot upsert:', error.message);
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
