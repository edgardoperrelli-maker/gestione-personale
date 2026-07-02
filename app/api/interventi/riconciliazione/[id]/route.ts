// PATCH /api/interventi/riconciliazione/[id] — segna come risolta una riga da_riconciliare (admin_plus).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAssignableRole, canManageUsers } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

async function requireAdminPlus(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Riservato agli Admin Plus.' }, { status: 403 });
  return true;
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('interventi')
    .update({ da_riconciliare: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
