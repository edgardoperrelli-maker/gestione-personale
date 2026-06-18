// app/api/mappa/rapportini/data/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { applicaSpostamentoDataRapportino } from '@/lib/interventi/spostaData';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { rapportinoId?: string; data?: string };
  const rapportinoId = String(body.rapportinoId ?? '').trim();
  const data = String(body.data ?? '').trim();
  if (!rapportinoId) return NextResponse.json({ error: 'rapportinoId richiesto.' }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'data richiesta.' }, { status: 400 });

  const res = await applicaSpostamentoDataRapportino(supabaseAdmin, rapportinoId, data);
  if (!res.ok) return NextResponse.json({ error: res.error, conflicts: res.conflicts }, { status: res.status });
  return NextResponse.json({ ok: true });
}
