// CRUD RISTRETTO sulla tassonomia attività (spec fase 2 §4.1): niente rename (la
// descrizione canonica è referenziata dallo storico: rinominare = nuova riga + disattiva
// la vecchia); delete solo se mai usata su interventi.
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { validaTassonomiaInput } from '@/lib/attivita/validaTassonomiaInput';

export const runtime = 'nodejs';

type RigaDb = { id: string; committente: string; descrizione: string; descrizione_norm: string; gruppo: string; attivo: boolean };

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

/** Utilizzo di una voce: quante righe interventi la referenziano (storico canonicalizzato →
 *  match esatto su intervento_tipo + committente equivalente, lim_massive conta come acea). */
async function utilizzoVoce(r: RigaDb): Promise<number> {
  const committenti = r.committente === 'acea' ? ['acea', 'lim_massive'] : [r.committente];
  const { count, error } = await supabaseAdmin
    .from('interventi')
    .select('id', { count: 'exact', head: true })
    .eq('intervento_tipo', r.descrizione)
    .in('committente', committenti);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .order('committente').order('gruppo').order('descrizione');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const righe = await Promise.all(
      ((data ?? []) as RigaDb[]).map(async (r) => ({ ...r, utilizzo: await utilizzoVoce(r) })),
    );
    return NextResponse.json({ righe });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore conteggio utilizzo.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const esito = validaTassonomiaInput(await req.json().catch(() => null));
  if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: 400 });
  // insert: descrizione_norm la calcola il trigger DB; unique (committente, descrizione_norm)
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .insert({ ...esito.valore, attivo: true })
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .single();
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: dup ? 'Esiste già questa descrizione per questo committente.' : error.message },
      { status: dup ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, riga: { ...(data as RigaDb), utilizzo: 0 } });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => null)) as { id?: unknown; attivo?: unknown } | null;
  const id = String(body?.id ?? '').trim();
  if (!id || typeof body?.attivo !== 'boolean') {
    return NextResponse.json({ error: 'Servono id e attivo (boolean). Le descrizioni non si rinominano: crea una nuova voce e disattiva la vecchia.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('attivita_tassonomia')
    .update({ attivo: body.attivo })
    .eq('id', id)
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const riga = data as RigaDb;
    return NextResponse.json({ ok: true, riga: { ...riga, utilizzo: await utilizzoVoce(riga) } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore conteggio utilizzo.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const id = String(new URL(req.url).searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });
  const { data: rigaData, error: e1 } = await supabaseAdmin
    .from('attivita_tassonomia')
    .select('id, committente, descrizione, descrizione_norm, gruppo, attivo')
    .eq('id', id)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!rigaData) return NextResponse.json({ error: 'Voce non trovata.' }, { status: 404 });
  try {
    const utilizzo = await utilizzoVoce(rigaData as RigaDb);
    if (utilizzo > 0) {
      return NextResponse.json(
        { error: `Voce già utilizzata da ${utilizzo} interventi: disattivala invece di eliminarla.`, utilizzo },
        { status: 409 },
      );
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore verifica utilizzo.' }, { status: 500 });
  }
  const { error } = await supabaseAdmin.from('attivita_tassonomia').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
