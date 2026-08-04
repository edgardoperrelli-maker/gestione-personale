import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/account/cambia-password — l'utente AUTENTICATO imposta la propria password.
 *
 * Nasce per il primo accesso operatore: le utenze create da /impostazioni/personale
 * hanno `must_change_password: true` nei metadata e il login le porta qui. Serve
 * `supabaseAdmin` perche' oltre alla password va spento quel flag, e `app_metadata`
 * si scrive solo col service role. Il resto dei metadata (role/allowedModules)
 * viene preservato: si spegne SOLO il flag.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const body = await req.json() as { newPassword?: string };
  const newPassword = String(body.newPassword ?? '').trim();
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Password minimo 6 caratteri.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
