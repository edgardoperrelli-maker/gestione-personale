import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const from = searchParams.get('from') ?? new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: raps } = await supabaseAdmin
    .from('rapportini')
    .select('id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at, riaperto_at')
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: false });
  const list = (raps ?? []) as Array<{
    id: string; piano_id: string; staff_id: string; staff_name: string | null;
    data: string; stato: string; token: string; expires_at: string; submitted_at: string | null; riaperto_at: string | null;
  }>;

  const pianoIds = [...new Set(list.map((r) => r.piano_id))];
  const pianoInfoById: Record<string, { territorio: string | null; creato_at: string | null }> = {};
  if (pianoIds.length) {
    const { data: piani } = await supabaseAdmin.from('mappa_piani').select('id, territorio, created_at').in('id', pianoIds);
    (piani ?? []).forEach((p: { id: string; territorio: string | null; created_at: string | null }) => {
      pianoInfoById[p.id] = { territorio: p.territorio ?? null, creato_at: p.created_at ?? null };
    });
  }

  const rapIds = list.map((r) => r.id);
  const vociCount: Record<string, number> = {};
  if (rapIds.length) {
    const { data: voci } = await supabaseAdmin.from('rapportino_voci').select('rapportino_id').in('rapportino_id', rapIds);
    (voci ?? []).forEach((v: { rapportino_id: string }) => { vociCount[v.rapportino_id] = (vociCount[v.rapportino_id] ?? 0) + 1; });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const nowIso = now.toISOString();
  const out = list.map((r) => ({
    ...r,
    territorio: pianoInfoById[r.piano_id]?.territorio ?? null,
    piano_creato_at: pianoInfoById[r.piano_id]?.creato_at ?? null,
    url: `${base}/r/${r.token}`,
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, nowIso),
    nVoci: vociCount[r.id] ?? 0,
  }));
  return NextResponse.json(out);
}
