import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * POST — traccia l'AVVIO di una sessione di assistenza (audit). Best-effort: se la migration
 * non è ancora applicata, non blocca l'assistenza (ritorna comunque ok).
 * Body: { sid, staff, data, origine }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { sid?: string; staff?: string; data?: string; origine?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'json non valido' }, { status: 400 });
  }
  if (!body.sid) return NextResponse.json({ error: 'sid mancante' }, { status: 400 });

  try {
    const { error } = await supabaseAdmin.from('assistenza_sessioni').insert({
      sid: body.sid,
      staff_name: body.staff ?? null,
      data: body.data ?? null,
      admin_id: auth.user.id,
      origine: body.origine === 'operatore' ? 'operatore' : 'backoffice',
    });
    if (error) return NextResponse.json({ ok: true, logged: false });
    return NextResponse.json({ ok: true, logged: true });
  } catch {
    return NextResponse.json({ ok: true, logged: false });
  }
}
