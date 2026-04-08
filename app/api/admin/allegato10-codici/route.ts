import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

/** GET — restituisce tutti i codici */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('allegato10_codici')
    .select('codice, genera_allegato, discovered_at, last_seen_at')
    .order('codice');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codici: data ?? [] });
}

/** POST — upsert codici rilevati da un file (auto-discovery, no auth check — solo aggiorna last_seen_at) */
export async function POST(req: NextRequest) {
  const body = await req.json() as { codici?: string[] };
  const codici = (body.codici ?? []).map(c => c.trim()).filter(Boolean);
  if (!codici.length) return NextResponse.json({ ok: true });

  const now = new Date().toISOString();
  const rows = codici.map(codice => ({
    codice,
    genera_allegato: false,
    discovered_at: now,
    last_seen_at: now,
  }));

  const { error } = await supabaseAdmin
    .from('allegato10_codici')
    .upsert(rows, {
      onConflict: 'codice',
      ignoreDuplicates: false,
    })
    .select();

  // Per i codici già esistenti, aggiorna solo last_seen_at (non toccare genera_allegato)
  for (const codice of codici) {
    await supabaseAdmin
      .from('allegato10_codici')
      .update({ last_seen_at: now })
      .eq('codice', codice);
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PATCH — toggle genera_allegato per un singolo codice */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { codice?: string; genera_allegato?: boolean };
  const codice = String(body.codice ?? '').trim();
  if (!codice) return NextResponse.json({ error: 'codice richiesto.' }, { status: 400 });
  if (typeof body.genera_allegato !== 'boolean')
    return NextResponse.json({ error: 'genera_allegato deve essere boolean.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('allegato10_codici')
    .update({ genera_allegato: body.genera_allegato })
    .eq('codice', codice)
    .select('codice, genera_allegato')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, codice: data });
}

/** DELETE — rimuove un codice dalla lista */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const codice = searchParams.get('codice')?.trim();
  if (!codice) return NextResponse.json({ error: 'codice richiesto.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('allegato10_codici')
    .delete()
    .eq('codice', codice);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
