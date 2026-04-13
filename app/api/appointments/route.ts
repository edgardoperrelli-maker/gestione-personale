import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function getAuthUser() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabaseAdmin
    .from('appointments')
    .select('id, pdr, nome_cognome, indirizzo, cap, citta, lat, lng, data, fascia_oraria, tipo_intervento, territorio_id, note, status, created_at, territories(id, name)')
    .order('data', { ascending: true })
    .order('fascia_oraria', { ascending: true });

  if (from) query = query.gte('data', from);
  if (to) query = query.lte('data', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointments: data });
}

// POST /api/appointments — crea nuovo appuntamento
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const body = await req.json() as {
    pdr: string;
    nome_cognome?: string | null;
    indirizzo?: string | null;
    cap?: string | null;
    citta?: string | null;
    lat?: number | null;
    lng?: number | null;
    data: string;
    fascia_oraria?: string | null;
    tipo_intervento?: string | null;
    territorio_id?: string | null;
    note?: string | null;
  };

  const pdr = String(body.pdr ?? '').trim();
  if (!pdr) return NextResponse.json({ error: 'PDR richiesto.' }, { status: 400 });

  const data = String(body.data ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Data non valida. Formato YYYY-MM-DD.' }, { status: 400 });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      pdr,
      nome_cognome: body.nome_cognome ?? null,
      indirizzo: body.indirizzo ?? null,
      cap: body.cap ?? null,
      citta: body.citta ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      data,
      fascia_oraria: body.fascia_oraria ?? null,
      tipo_intervento: body.tipo_intervento ?? null,
      territorio_id: body.territorio_id ?? null,
      note: body.note ?? null,
      created_by: user.id,
    })
    .select('id, pdr, nome_cognome, indirizzo, cap, citta, lat, lng, data, fascia_oraria, tipo_intervento, territorio_id, note, status, territories(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, appointment: inserted });
}

// PATCH /api/appointments — aggiorna data (spostamento drag) o status
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const body = await req.json() as {
    id: string;
    data?: string | null;
    status?: string | null;
  };

  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'ID appuntamento richiesto.' }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (body.data !== undefined) {
    const d = String(body.data ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'Data non valida.' }, { status: 400 });
    }
    patch.data = d;
  }

  if (body.status !== undefined) {
    if (!['pending', 'confirmed'].includes(body.status ?? '')) {
      return NextResponse.json({ error: 'Status non valido.' }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nessun campo da aggiornare.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .select('id, pdr, nome_cognome, indirizzo, cap, citta, lat, lng, data, fascia_oraria, tipo_intervento, territorio_id, note, status, territories(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, appointment: data });
}

// DELETE /api/appointments?id=UUID
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
