import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/api/requireAdmin';
import { normalizeUsername, toEmail, usernameFromEmail } from '@/lib/auth/usernameFromEmail';
import { toStoredProfileRole } from '@/lib/moduleAccess';

/**
 * Credenziali app degli operatori (/impostazioni/personale).
 *
 * Il ponte e' `staff.user_id` → `auth.users`: qui si crea l'utenza MINIMA
 * (ruolo operatore, solo il modulo `oggi`, password temporanea da cambiare al
 * primo accesso), si resetta la password e si scollega. La CANCELLAZIONE
 * dell'utenza resta all'area Utenze (admin_plus): questa route non cancella mai.
 *
 * La password temporanea esce UNA volta sola, nella risposta di POST/PATCH,
 * verso l'admin che la consegna a voce. Mai nel GET, mai nell'audit.
 */

// Password temporanea leggibile: 10 caratteri, senza gli ambigui 0/O/1/l/I
// (va dettata a voce o copiata a mano su un telefono).
const ALFABETO_PASSWORD = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generaPasswordTemporanea(): string {
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += ALFABETO_PASSWORD[randomInt(ALFABETO_PASSWORD.length)];
  }
  return out;
}

type StaffRow = { id: string; user_id: string | null };

/** Riga staff per id, oppure la NextResponse d'errore gia' pronta. */
async function caricaStaff(staffId: string): Promise<StaffRow | NextResponse> {
  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('id, user_id')
    .eq('id', staffId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Operatore non trovato.' }, { status: 404 });
  return data as StaffRow;
}

/** Audit senza segreti: mai la password nel payload. Best-effort, non blocca la risposta. */
async function logAudit(actor: string, action: string, staffId: string, payload: Record<string, unknown>) {
  await supabaseAdmin.rpc('log_audit', {
    p_actor: actor,
    p_action: action,
    p_entity: 'staff',
    p_entity_id: staffId,
    p_payload: payload,
  });
}

/* GET — mappa staff_id → { username, userId } per gli operatori con utenza collegata. */
export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('id, user_id')
    .not('user_id', 'is', null);
  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 });

  // Username dall'email finta dell'utenza: auth e' la fonte (profiles puo' essere stantia).
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  const emailById = new Map<string, string>(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? '']),
  );

  const credenziali: Record<string, { username: string; userId: string }> = {};
  for (const row of (staffRows ?? []) as { id: string; user_id: string }[]) {
    credenziali[row.id] = {
      username: usernameFromEmail(emailById.get(row.user_id)),
      userId: row.user_id,
    };
  }

  return NextResponse.json({ credenziali }, { headers: { 'Cache-Control': 'no-store' } });
}

/* POST — crea l'utenza minima e la collega all'operatore. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { staffId?: string; username?: string; password?: string };

  const staffId = String(body.staffId ?? '').trim();
  if (!staffId) return NextResponse.json({ error: 'staffId richiesto.' }, { status: 400 });

  const username = normalizeUsername(String(body.username ?? ''));
  if (!username) return NextResponse.json({ error: 'Username richiesto.' }, { status: 400 });

  const passwordFornita = String(body.password ?? '').trim();
  if (passwordFornita && passwordFornita.length < 6) {
    return NextResponse.json({ error: 'Password minimo 6 caratteri.' }, { status: 400 });
  }
  const tempPassword = passwordFornita || generaPasswordTemporanea();

  const staffRow = await caricaStaff(staffId);
  if (staffRow instanceof NextResponse) return staffRow;
  if (staffRow.user_id) {
    return NextResponse.json({ error: 'Operatore già collegato a un’utenza.' }, { status: 409 });
  }

  // Utenza minima: solo la home «Il mio giorno», password da cambiare al primo accesso.
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: toEmail(username),
    password: tempPassword,
    email_confirm: true,
    app_metadata: {
      role: 'operatore',
      allowedModules: ['oggi'],
      modificaInterventi: false,
      must_change_password: true,
    },
  });
  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Errore creazione utente.' }, { status: 400 });
  }
  const userId = authData.user.id;

  const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
    id: userId,
    username,
    role: toStoredProfileRole('operatore'),
  });
  if (profileErr) {
    // Compensazione: senza profilo ne' aggancio, l'utenza appena creata sarebbe orfana.
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // Aggancio SOLO se nel frattempo nessuno ha collegato l'operatore (doppio POST concorrente).
  const { data: linkData, error: linkErr } = await supabaseAdmin
    .from('staff')
    .update({ user_id: userId })
    .eq('id', staffId)
    .is('user_id', null)
    .select('id');
  if (linkErr || !linkData || linkData.length === 0) {
    await supabaseAdmin.from('profiles').delete().eq('id', userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: linkErr?.message ?? 'Operatore già collegato a un’utenza.' },
      { status: linkErr ? 500 : 409 },
    );
  }

  await logAudit(guard.userId, 'credenziali_crea', staffId, { username, user_id: userId });

  // La password temporanea esce UNA volta: qui.
  return NextResponse.json({ ok: true, username, tempPassword });
}

/* PATCH — { staffId, azione: 'reset' }: nuova password temporanea. */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { staffId?: string; azione?: string };

  const staffId = String(body.staffId ?? '').trim();
  if (!staffId) return NextResponse.json({ error: 'staffId richiesto.' }, { status: 400 });
  if (body.azione !== 'reset') {
    return NextResponse.json({ error: 'Azione non supportata.' }, { status: 400 });
  }

  const staffRow = await caricaStaff(staffId);
  if (staffRow instanceof NextResponse) return staffRow;
  if (!staffRow.user_id) {
    return NextResponse.json({ error: 'Nessuna utenza collegata.' }, { status: 400 });
  }

  // Leggi PRIMA l'utente: l'app_metadata va preservata (role/allowedModules/modificaInterventi),
  // si riaccende SOLO il flag must_change_password. Riscriverla da zero declasserebbe l'utente.
  const { data: current, error: getErr } = await supabaseAdmin.auth.admin.getUserById(staffRow.user_id);
  if (getErr || !current?.user) {
    return NextResponse.json({ error: getErr?.message ?? 'Utenza non trovata.' }, { status: 400 });
  }

  const tempPassword = generaPasswordTemporanea();
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(staffRow.user_id, {
    password: tempPassword,
    app_metadata: { ...current.user.app_metadata, must_change_password: true },
  });
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  await logAudit(guard.userId, 'credenziali_reset', staffId, { user_id: staffRow.user_id });

  return NextResponse.json({ ok: true, tempPassword });
}

/* DELETE — { staffId }: scollega soltanto (staff.user_id = null), l'utenza resta viva. */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { staffId?: string };

  const staffId = String(body.staffId ?? '').trim();
  if (!staffId) return NextResponse.json({ error: 'staffId richiesto.' }, { status: 400 });

  const staffRow = await caricaStaff(staffId);
  if (staffRow instanceof NextResponse) return staffRow;
  if (!staffRow.user_id) {
    return NextResponse.json({ error: 'Nessuna utenza collegata.' }, { status: 400 });
  }

  const { error: unlinkErr } = await supabaseAdmin
    .from('staff')
    .update({ user_id: null })
    .eq('id', staffId);
  if (unlinkErr) return NextResponse.json({ error: unlinkErr.message }, { status: 500 });

  await logAudit(guard.userId, 'credenziali_scollega', staffId, { user_id: staffRow.user_id });

  return NextResponse.json({ ok: true });
}
