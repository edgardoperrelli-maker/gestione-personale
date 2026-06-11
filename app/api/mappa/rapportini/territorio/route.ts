// app/api/mappa/rapportini/territorio/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { applicaSpostamentoTerritorio } from '@/lib/interventi/territorioOverride';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { rapportinoId?: string; territorio?: string | null };
  const rapportinoId = String(body.rapportinoId ?? '').trim();
  if (!rapportinoId) return NextResponse.json({ error: 'rapportinoId richiesto.' }, { status: 400 });

  const res = await applicaSpostamentoTerritorio(supabaseAdmin, rapportinoId, body.territorio ?? null);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
