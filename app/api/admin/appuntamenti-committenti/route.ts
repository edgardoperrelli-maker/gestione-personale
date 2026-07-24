import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

// CRUD dei committenti e territori DEGLI APPUNTAMENTI. Un solo file, due entità
// distinte dal campo `tipo`: 'committente' | 'territorio'. Scrittura riservata
// agli admin (service role), come per i territori della mappa.

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') {
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  }
  return true;
}

const nome = (v: unknown) => String(v ?? '').trim();

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { tipo?: string; nome?: string; committenteId?: string };

  if (body.tipo === 'committente') {
    const n = nome(body.nome);
    if (!n) return NextResponse.json({ error: 'Nome committente richiesto.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('appuntamenti_committenti')
      .insert({ nome: n })
      .select('id, nome, attivo')
      .single();
    if (error) return NextResponse.json({ error: messaggio(error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, committente: { ...data, territori: [] } });
  }

  if (body.tipo === 'territorio') {
    const n = nome(body.nome);
    const committenteId = String(body.committenteId ?? '').trim();
    if (!committenteId) return NextResponse.json({ error: 'Committente richiesto.' }, { status: 400 });
    if (!n) return NextResponse.json({ error: 'Nome territorio richiesto.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('appuntamenti_territori')
      .insert({ committente_id: committenteId, nome: n })
      .select('id, committente_id, nome, attivo')
      .single();
    if (error) return NextResponse.json({ error: messaggio(error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, territorio: data });
  }

  return NextResponse.json({ error: 'Tipo non valido.' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { tipo?: string; id?: string; nome?: string; attivo?: boolean };
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const tabella = body.tipo === 'committente' ? 'appuntamenti_committenti'
    : body.tipo === 'territorio' ? 'appuntamenti_territori'
    : null;
  if (!tabella) return NextResponse.json({ error: 'Tipo non valido.' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.nome !== undefined) {
    const n = nome(body.nome);
    if (!n) return NextResponse.json({ error: 'Nome richiesto.' }, { status: 400 });
    patch.nome = n;
  }
  if (body.attivo !== undefined) patch.attivo = !!body.attivo;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nessun campo da aggiornare.' }, { status: 400 });
  }

  const select = tabella === 'appuntamenti_committenti' ? 'id, nome, attivo' : 'id, committente_id, nome, attivo';
  const { data, error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id).select(select).single();
  if (error) return NextResponse.json({ error: messaggio(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, riga: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo');
  const id = String(searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  if (tipo === 'territorio') {
    // Non si elimina un territorio già usato da un appuntamento: si disattiva.
    const { count, error: usoErr } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('appuntamento_territorio_id', id);
    if (usoErr) return NextResponse.json({ error: usoErr.message }, { status: 500 });
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: 'Territorio già usato in un appuntamento. Disattivalo invece di eliminarlo.',
      }, { status: 409 });
    }
    const { error } = await supabaseAdmin.from('appuntamenti_territori').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === 'committente') {
    // Un committente con appuntamenti collegati non si elimina: si disattiva.
    // (I suoi territori cadono in cascata via FK, ma solo se nessuno è in uso.)
    const { count, error: usoErr } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('committente_id', id);
    if (usoErr) return NextResponse.json({ error: usoErr.message }, { status: 500 });
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: 'Committente già usato in un appuntamento. Disattivalo invece di eliminarlo.',
      }, { status: 409 });
    }
    const { error } = await supabaseAdmin.from('appuntamenti_committenti').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Tipo non valido.' }, { status: 400 });
}

/** Rende parlante l'errore di unicità di Postgres (indice su lower(nome)). */
function messaggio(raw: string): string {
  if (/duplicate key|unique/i.test(raw)) return 'Esiste già una voce con questo nome.';
  return raw;
}
