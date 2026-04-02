import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { toStoredProfileRole } from '@/lib/moduleAccess';

export async function POST(req: NextRequest) {
  const { username, password, role } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'username e password richiesti' }, { status: 400 });
  }
  const normalizedUsername = String(username)
    .trim()
    .toLowerCase()
    .replace(/^u_/, '')
    .replace(/@local\.it$/, '')
    .replace(/@local$/, '');
  const email = `u_${normalizedUsername}@local.it`;

  // crea utente auth confermato
  const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (userErr || !userRes.user) {
    return NextResponse.json({ error: userErr?.message ?? 'errore creazione utente' }, { status: 400 });
  }

  // profilo + ruolo
  const { error: insErr } = await supabaseAdmin.from('profiles').insert({
    id: userRes.user.id,
    username: normalizedUsername,
    role: toStoredProfileRole(role === 'admin' ? 'admin' : 'operatore')
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  // audit
  await supabaseAdmin.rpc('log_audit', {
    p_actor: userRes.user.id,
    p_action: 'admin_create_user',
    p_entity: 'profiles',
    p_entity_id: userRes.user.id,
    p_payload: { username: normalizedUsername, role: role ?? 'operatore' }
  });

  return NextResponse.json({ ok: true, user_id: userRes.user.id, email });
}
