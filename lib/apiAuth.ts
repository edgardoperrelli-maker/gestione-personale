import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole, type ValidRole } from '@/lib/moduleAccess';
import type { User } from '@supabase/supabase-js';

/**
 * Helper centralizzati di autorizzazione per le Route Handler.
 *
 * Le API che usano `supabaseAdmin` (service-role) bypassano la RLS: senza un
 * controllo esplicito di sessione qualsiasi client non autenticato potrebbe
 * leggere/scrivere dati. Usare SEMPRE `requireUser()` (o `requireAdmin()`) in
 * cima alle route che toccano `supabaseAdmin`, tranne quelle pubbliche per
 * design (es. `/api/r/[token]/*`, protette dal token).
 */

async function routeClient() {
  const cookieStore = await cookies();
  // Le auth-helpers si aspettano una factory sincrona che restituisce il cookie store.
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  return createRouteHandlerClient({ cookies: cookieMethods });
}

async function getSessionUser(): Promise<User | null> {
  const supabase = await routeClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/** Richiede un utente autenticato. Ritorna `{ user }` oppure una risposta 401. */
export async function requireUser(): Promise<{ user: User } | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  return { user };
}

/** Richiede un utente con ruolo admin. Ritorna `{ user, role }` oppure 401/403. */
export async function requireAdmin(): Promise<{ user: User; role: ValidRole } | NextResponse> {
  const supabase = await routeClient();
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
  return { user, role };
}
