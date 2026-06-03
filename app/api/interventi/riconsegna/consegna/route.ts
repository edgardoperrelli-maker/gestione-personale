import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { PENALE_MISURATORE } from '@/lib/interventi/riconsegnaLogic';

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

/** Data odierna Europe/Rome (YYYY-MM-DD). */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/**
 * POST /api/interventi/riconsegna/consegna — registra la consegna della cesta.
 * Body: { consegnatiIds: string[], firma?: boolean }.
 * I misuratori in custodia selezionati → 'consegnato'; gli altri → 'mancante'.
 */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as { consegnatiIds?: unknown; firma?: unknown };
  const consegnatiIds = Array.isArray(body.consegnatiIds)
    ? body.consegnatiIds.filter((x): x is string => typeof x === 'string')
    : [];
  const firma = body.firma === true;

  const { data: cesta } = await supabaseAdmin
    .from('misuratori_riconsegna')
    .select('id')
    .in('stato', ['in_custodia', 'in_riepilogo']);
  const cestaIds = ((cesta ?? []) as Array<{ id: string }>).map((m) => m.id);

  const consegnati = consegnatiIds.filter((id) => cestaIds.includes(id));
  const consegnatiSet = new Set(consegnati);
  const mancantiIds = cestaIds.filter((id) => !consegnatiSet.has(id));

  if (consegnati.length > 0) {
    const { error } = await supabaseAdmin
      .from('misuratori_riconsegna')
      .update({ stato: 'consegnato', data_consegna: oggiRoma(), riepilogo_firmato: firma })
      .in('id', consegnati);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (mancantiIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('misuratori_riconsegna')
      .update({ stato: 'mancante' })
      .in('id', mancantiIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    consegnati: consegnati.length,
    mancanti: mancantiIds.length,
    penale: mancantiIds.length * PENALE_MISURATORE,
  });
}
