// app/api/mappa/piani/sposta/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { applicaSpostamentoPiano } from '@/lib/interventi/spostaPiano';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { pianoId?: string; data?: string; territorio?: string | null };
  const pianoId = String(body.pianoId ?? '').trim();
  if (!pianoId) return NextResponse.json({ error: 'pianoId richiesto.' }, { status: 400 });

  const opts: { data?: string; territorio?: string | null } = {};
  if (typeof body.data === 'string' && body.data.trim()) opts.data = body.data.trim();
  if ('territorio' in body) opts.territorio = body.territorio ?? null;

  const res = await applicaSpostamentoPiano(supabaseAdmin, pianoId, opts);
  if (!res.ok) return NextResponse.json({ error: res.error, conflicts: res.conflicts }, { status: res.status });
  return NextResponse.json({ ok: true });
}
