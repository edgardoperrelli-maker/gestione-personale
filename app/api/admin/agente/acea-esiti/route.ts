// app/api/admin/agente/acea-esiti/route.ts
// Esito dell'assegnazione su ACEA (per dare feedback nel modulo Assegnazione AI):
// - ultimoRun: l'ultimo giro 'acea-assegna' (per capire "ha girato ma 0 ODL" ecc.)
// - righe: gli esiti per-ODL del giorno richiesto da acea_assegnazioni_log
// - riepilogo: conteggio per esito
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

type Dettaglio = { data?: string; dryRun?: boolean; scartati?: unknown[]; erroreGlobale?: string };

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get('data') ?? '').trim();

  // ultimo giro ACEA (qualunque data) → contesto: ha girato? per quale giorno? quanti ODL?
  const { data: runRows } = await supabaseAdmin
    .from('agente_run')
    .select('dry_run, lavori, aggiornate, dettaglio, creato_il, errore')
    .eq('tipo', 'acea-assegna')
    .order('creato_il', { ascending: false })
    .limit(1);
  const run = (runRows?.[0] ?? null) as
    | { dry_run: boolean; lavori: number; aggiornate: number; dettaglio: Dettaglio | null; creato_il: string; errore: string | null }
    | null;
  const ultimoRun = run
    ? {
        giorno: run.dettaglio?.data ?? null,
        dryRun: run.dry_run,
        lavori: run.lavori,
        aggiornate: run.aggiornate,
        scartati: Array.isArray(run.dettaglio?.scartati) ? run.dettaglio!.scartati!.length : 0,
        errore: run.errore ?? run.dettaglio?.erroreGlobale ?? null,
        creato_il: run.creato_il,
      }
    : null;

  // esiti per-ODL del giorno richiesto
  let q = supabaseAdmin
    .from('acea_assegnazioni_log')
    .select('odl, operatore_acea, esito, motivo, dry_run, creato_il')
    .order('creato_il', { ascending: false })
    .limit(500);
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) q = q.eq('data_assegnazione', data);
  const { data: righe } = await q;

  const riepilogo: Record<string, number> = {};
  for (const r of (righe ?? []) as { esito: string }[]) riepilogo[r.esito] = (riepilogo[r.esito] ?? 0) + 1;

  return NextResponse.json(
    { data, ultimoRun, righe: righe ?? [], riepilogo },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
