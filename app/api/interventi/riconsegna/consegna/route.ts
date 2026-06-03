import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') {
    return NextResponse.json({ error: 'Riservato agli admin.' }, { status: 403 });
  }
  return null;
}

function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/**
 * POST /api/interventi/riconsegna/consegna — controllo scarico magazzino del giorno.
 * Body: { giorno: 'YYYY-MM-DD', consegnatiIds: string[] }.
 * Sui misuratori rimossi in quel giorno: selezionati → 'consegnato', gli altri → 'mancante'.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as { giorno?: unknown; consegnatiIds?: unknown };
  const giorno = typeof body.giorno === 'string' && body.giorno.trim() !== '' ? body.giorno : null;
  const consegnatiIds = Array.isArray(body.consegnatiIds)
    ? body.consegnatiIds.filter((x): x is string => typeof x === 'string')
    : [];
  if (!giorno) return NextResponse.json({ error: 'Giorno mancante.' }, { status: 400 });

  const { data: delGiorno, error } = await supabaseAdmin
    .from('misuratori_riconsegna')
    .select('id')
    .eq('data_rimozione', giorno);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = ((delGiorno ?? []) as Array<{ id: string }>).map((m) => m.id);
  const consegnatiSet = new Set(consegnatiIds.filter((id) => ids.includes(id)));
  const mancantiIds = ids.filter((id) => !consegnatiSet.has(id));

  if (consegnatiSet.size > 0) {
    const { error: e } = await supabaseAdmin
      .from('misuratori_riconsegna')
      .update({ stato: 'consegnato', data_consegna: oggiRoma() })
      .in('id', Array.from(consegnatiSet));
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  }
  if (mancantiIds.length > 0) {
    const { error: e } = await supabaseAdmin
      .from('misuratori_riconsegna')
      .update({ stato: 'mancante', data_consegna: null })
      .in('id', mancantiIds);
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ consegnati: consegnatiSet.size, mancanti: mancantiIds.length });
}
