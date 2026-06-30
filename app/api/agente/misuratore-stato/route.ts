import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { normMatricola } from '@/lib/limitazione/verdettoEsecuzione';

export const runtime = 'nodejs';

// L'agente, al giro stato ACEA, riporta qui lo stato/esito per-matricola (dal master + export).
// Upsert idempotente per (committente, matricola_norm): alimenta il blocco anti-duplicato al "+".
type RigaIn = { matricola?: string; odl?: string; esito?: string; stato_odl?: string; comune?: string; esecutore?: string };

export async function POST(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });

  let body: { committente?: string; righe?: RigaIn[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }

  const committente = String(body.committente ?? 'acea').trim() || 'acea';
  const righe = (Array.isArray(body.righe) ? body.righe : [])
    .map((r) => ({
      committente,
      matricola: String(r?.matricola ?? '').trim(),
      matricola_norm: normMatricola(String(r?.matricola ?? '')),
      odl: r?.odl ?? null,
      esito: r?.esito ?? null,
      stato_odl: r?.stato_odl ?? null,
      comune: r?.comune ?? null,
      esecutore: r?.esecutore ?? null,
      aggiornato_il: new Date().toISOString(),
    }))
    .filter((r) => r.matricola_norm !== '');

  // dedup per matricola_norm (l'ultima riga vince) → upsert pulito sull'unique index.
  const perNorm = new Map(righe.map((r) => [r.matricola_norm, r]));
  const rows = [...perNorm.values()];

  try {
    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from('limitazione_misuratori_stato')
        .upsert(rows, { onConflict: 'committente,matricola_norm' });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, n: rows.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore misuratore-stato.' }, { status: 500 });
  }
}
