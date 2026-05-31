import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const pianoId = new URL(req.url).searchParams.get('pianoId');
  if (!pianoId) return NextResponse.json({ error: 'pianoId mancante' }, { status: 400 });
  const { data: raps } = await supabaseAdmin.from('rapportini')
    .select('id, staff_id, staff_name, token, stato, expires_at, submitted_at, data').eq('piano_id', pianoId);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  const now = new Date().toISOString();
  const out = await Promise.all((raps ?? []).map(async (r: any) => {
    const { count } = await supabaseAdmin.from('rapportino_voci')
      .select('id', { count: 'exact', head: true }).eq('rapportino_id', r.id);
    return { ...r, url: `${base}/r/${r.token}`, statoCalcolato: tokenStatus(r, now), nVoci: count ?? 0 };
  }));
  return NextResponse.json(out);
}
