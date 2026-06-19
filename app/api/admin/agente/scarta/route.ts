import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// Rimuove righe da agente_pianificabili (anteprima): l'operatore/le righe scartate
// non verranno pianificate e spariscono dalla lista. Il set è volatile (ri-popolato da "Leggi").
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { ids?: string[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, rimosse: 0 });

  const { error } = await supabaseAdmin.from('agente_pianificabili').delete().in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rimosse: ids.length }, { headers: { 'Cache-Control': 'no-store' } });
}
