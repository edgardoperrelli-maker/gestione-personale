import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole } from '@/lib/moduleAccess';

/**
 * Guard condiviso delle route admin di backoffice (basta il ruolo `admin`,
 * non serve Plus). Estratto da app/api/admin/personale/route.ts senza cambiarne
 * il comportamento; in piu' restituisce lo userId dell'admin autenticato, che
 * serve come attore per l'audit (`log_audit`).
 *
 * Uso: `const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;`
 */
export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  }
  return { userId: user.id };
}
