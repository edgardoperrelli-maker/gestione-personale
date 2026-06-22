import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';

export const runtime = 'nodejs';

type RigaIn = { riga?: number; odl?: string; matricola?: string; indirizzo?: string; comune?: string; data?: string; esecutore?: string; statoOdl?: string };

export async function POST(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  let body: { file?: string; data?: string; righe?: RigaIn[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }

  const file = String(body.file ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'file/data obbligatori (data YYYY-MM-DD).' }, { status: 400 });
  }
  const righe = Array.isArray(body.righe) ? body.righe : [];

  try {
    // rimpiazza il set per (file, data)
    await supabaseAdmin.from('agente_pianificabili').delete().eq('file', file).eq('data', data);
    if (righe.length > 0) {
      const rows = righe.map((r) => ({
        file, data,
        riga: Number(r.riga ?? 0),
        odl: r.odl ?? null, matricola: r.matricola ?? null, indirizzo: r.indirizzo ?? null,
        comune: r.comune ?? null, esecutore: r.esecutore ?? null,
        stato_odl: r.statoOdl ?? null,
        scansionato_il: new Date().toISOString(),
      }));
      const { error } = await supabaseAdmin.from('agente_pianificabili').insert(rows);
      if (error) throw error;
    }
    // one-shot: la richiesta di lettura è soddisfatta
    await supabaseAdmin.from('agente_config').update({ pianifica_data: null }).eq('id', 1);
    return NextResponse.json({ ok: true, n: righe.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore pianificabili.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
