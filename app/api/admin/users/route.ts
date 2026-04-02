import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  APP_MODULES,
  getAllowedModulesForUser,
  normalizeAllowedModules,
  ROLE_LABELS,
  resolveUserRole,
  toStoredProfileRole,
  isValidRole,
  type AppModuleKey,
  type ValidRole,
} from '@/lib/moduleAccess';

const LOCAL_DOMAIN = '@local.it';
const LEGACY_LOCAL_DOMAIN = '@local';

function normalizeUsername(value: string): string {
  const t = value.trim().toLowerCase();
  const withoutDomain =
    t.endsWith(LOCAL_DOMAIN) ? t.slice(0, -LOCAL_DOMAIN.length) :
    t.endsWith(LEGACY_LOCAL_DOMAIN) ? t.slice(0, -LEGACY_LOCAL_DOMAIN.length) :
    t;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}

function toEmail(username: string): string {
  return `u_${normalizeUsername(username)}${LOCAL_DOMAIN}`;
}

function toUsername(email: string): string {
  return normalizeUsername(email);
}

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: async () => cookieStore });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  const effectiveRole = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (effectiveRole !== 'admin') {
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  }
  return { userId: user.id };
}

/* GET — lista tutti gli utenti */
export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const [authRes, profilesRes] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    supabaseAdmin.from('profiles').select('id, username, role'),
  ]);

  if (authRes.error) {
    return NextResponse.json({ error: authRes.error.message }, { status: 500 });
  }

  const profileMap = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; username: string; role: string }>)
      .map((p) => [p.id, p])
  );

  const users = (authRes.data?.users ?? []).map((u) => {
    const profile = profileMap.get(u.id);
    const role = resolveUserRole(profile?.role, u.app_metadata?.role);
    return {
      userId: u.id,
      email: u.email ?? '',
      username: profile?.username ?? toUsername(u.email ?? ''),
      role,
      roleLabel: ROLE_LABELS[role],
      allowedModules: getAllowedModulesForUser(u.app_metadata, role),
      createdAt: u.created_at,
    };
  }).sort((a, b) => a.username.localeCompare(b.username, 'it'));

  return NextResponse.json({
    users,
    availableModules: APP_MODULES.map((module) => ({
      key: module.key,
      label: module.label,
      description: module.description,
      adminOnly: !!module.adminOnly,
    })),
  });
}

/* POST — crea nuovo utente */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    username?: string;
    password?: string;
    role?: string;
    allowedModules?: AppModuleKey[];
  };

  const username = normalizeUsername(body.username ?? '');
  const password = (body.password ?? '').trim();
  const role: ValidRole = isValidRole(body.role) ? body.role : 'operatore';
  const allowedModules = normalizeAllowedModules(body.allowedModules, role);

  if (!username) return NextResponse.json({ error: 'Username richiesto.' }, { status: 400 });
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password minimo 6 caratteri.' }, { status: 400 });
  }

  const email = toEmail(username);

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role, allowedModules },
  });

  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Errore creazione utente.' }, { status: 400 });
  }

  const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
    id: authData.user.id,
    username,
    role: toStoredProfileRole(role),
  });

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      userId: authData.user.id,
      email,
      username,
      role,
      roleLabel: ROLE_LABELS[role],
      allowedModules,
      createdAt: authData.user.created_at,
    },
  });
}

/* PATCH — aggiorna password e/o ruolo */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    userId?: string;
    password?: string;
    role?: string;
    username?: string;
    allowedModules?: AppModuleKey[];
  };

  const userId = (body.userId ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'userId richiesto.' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  const role = isValidRole(body.role) ? body.role : undefined;
  if (body.password && body.password.trim().length >= 6) {
    updates.password = body.password.trim();
  } else if (body.password && body.password.trim().length > 0) {
    return NextResponse.json({ error: 'Password minimo 6 caratteri.' }, { status: 400 });
  }
  if (body.username && normalizeUsername(body.username)) {
    updates.email = toEmail(body.username);
  }

  if (role || Array.isArray(body.allowedModules)) {
    updates.app_metadata = {
      role,
      allowedModules: normalizeAllowedModules(body.allowedModules, role ?? null),
    };
  }

  if (Object.keys(updates).length > 0) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, updates);
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = { id: userId };
  if (body.username) profilePatch.username = normalizeUsername(body.username);
  if (role) profilePatch.role = toStoredProfileRole(role);

  if (Object.keys(profilePatch).length > 1) {
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(profilePatch);
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/* DELETE — elimina utente */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { userId } = await req.json() as { userId?: string };
  if (!userId) return NextResponse.json({ error: 'userId richiesto.' }, { status: 400 });
  if (userId === guard.userId) {
    return NextResponse.json({ error: 'Non puoi eliminare l’utenza con cui sei autenticato.' }, { status: 400 });
  }

  const { error: auditErr } = await supabaseAdmin
    .from('audit_log')
    .update({ actor: null })
    .eq('actor', userId);

  if (auditErr) {
    return NextResponse.json({ error: auditErr.message }, { status: 500 });
  }

  const { error: profileErr } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
