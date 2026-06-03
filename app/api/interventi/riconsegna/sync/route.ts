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

/**
 * POST /api/interventi/riconsegna/sync — genera i record di riconsegna dai
 * misuratori rimossi: interventi completati con esito positivo e matricola.
 * Idempotente: salta gli interventi che hanno già un record.
 */
export async function POST() {
  const guard = await requireAdmin();
  if (guard) return guard;

  const { data: rows, error } = await supabaseAdmin
    .from('interventi')
    .select('id, matricola_contatore, contratto, utenza, odl, chiuso_at')
    .eq('stato', 'completato')
    .eq('esito', 'eseguito_positivo')
    .not('matricola_contatore', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const interventi = (rows ?? []) as Array<{
    id: string;
    matricola_contatore: string | null;
    contratto: string | null;
    utenza: string | null;
    odl: string | null;
    chiuso_at: string | null;
  }>;

  const { data: existing } = await supabaseAdmin.from('misuratori_riconsegna').select('intervento_id');
  const giaPresenti = new Set(
    ((existing ?? []) as Array<{ intervento_id: string | null }>).map((e) => e.intervento_id),
  );

  const daInserire = interventi
    .filter((it) => it.matricola_contatore && !giaPresenti.has(it.id))
    .map((it) => ({
      intervento_id: it.id,
      matricola: it.matricola_contatore as string,
      contratto: it.contratto,
      utenza: it.utenza,
      odl: it.odl,
      stato: 'in_custodia',
      data_rimozione: it.chiuso_at ? it.chiuso_at.slice(0, 10) : null,
    }));

  if (daInserire.length > 0) {
    const { error: ie } = await supabaseAdmin
      .from('misuratori_riconsegna')
      .upsert(daInserire, { onConflict: 'matricola,data_rimozione', ignoreDuplicates: true });
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  }

  return NextResponse.json({ creati: daInserire.length });
}
