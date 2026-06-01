import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { requireUser } from '@/lib/apiAuth';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const pianoId = new URL(req.url).searchParams.get('pianoId');
  if (!pianoId) return NextResponse.json({ error: 'pianoId mancante' }, { status: 400 });
  const { data: raps } = await supabaseAdmin.from('rapportini')
    .select('id, staff_id, staff_name, token, stato, expires_at, submitted_at, data').eq('piano_id', pianoId);
  const list = (raps ?? []) as Array<{
    id: string; staff_id: string; staff_name: string | null; token: string;
    stato: 'in_corso' | 'inviato' | 'scaduto'; expires_at: string;
    submitted_at: string | null; data: string;
  }>;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const now = new Date().toISOString();

  // Conteggio voci per tutti i rapportini in un'unica query (evita N+1).
  const rapIds = list.map((r) => r.id);
  const vociCount = new Map<string, number>();
  if (rapIds.length) {
    const { data: voci } = await supabaseAdmin.from('rapportino_voci')
      .select('rapportino_id').in('rapportino_id', rapIds);
    for (const v of (voci ?? []) as { rapportino_id: string }[]) {
      vociCount.set(v.rapportino_id, (vociCount.get(v.rapportino_id) ?? 0) + 1);
    }
  }

  const out = list.map((r) => ({
    ...r,
    url: `${base}/r/${r.token}`,
    statoCalcolato: tokenStatus(r, now),
    nVoci: vociCount.get(r.id) ?? 0,
  }));
  return NextResponse.json(out);
}
