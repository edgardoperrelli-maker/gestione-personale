import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// GET /api/annunci?key=crono-squadre-v1 → { seen: boolean } per l'utente corrente.
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!key) return NextResponse.json({ error: 'Parametro "key" obbligatorio.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('annunci_visti')
    .select('annuncio_key')
    .eq('user_id', auth.user.id)
    .eq('annuncio_key', key)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seen: !!data }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/annunci { key } → registra l'annuncio come visto per l'utente corrente (idempotente).
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { key } = await req.json().catch(() => ({ key: '' }));
  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Campo "key" obbligatorio.' }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from('annunci_visti')
    .upsert({ user_id: auth.user.id, annuncio_key: key }, { onConflict: 'user_id,annuncio_key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
