import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

function normalizeNullableString(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function normalizeNullableDate(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : Number.NaN;
}

async function requireAdmin(): Promise<true | NextResponse> {
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

  return true;
}

function validateDateRange(validFrom: string | null, validTo: string | null): string | null {
  if (validFrom === '' || validTo === '') {
    return 'Formato data non valido. Usa YYYY-MM-DD.';
  }
  if (validFrom && validTo && validFrom > validTo) {
    return 'La data fine validita non puo precedere la data inizio.';
  }
  return null;
}

function validateCoordinates(lat: number | null, lng: number | null): string | null {
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return 'Coordinate territorio non valide.';
  }
  if ((lat === null) !== (lng === null)) {
    return 'Inserisci sia latitudine sia longitudine, oppure lascia entrambi vuoti.';
  }
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    name?: string;
    active?: boolean;
    validFrom?: string | null;
    validTo?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  };

  const name = normalizeNullableString(body.name);
  if (!name) {
    return NextResponse.json({ error: 'Nome territorio richiesto.' }, { status: 400 });
  }

  const validFrom = normalizeNullableDate(body.validFrom);
  const validTo = normalizeNullableDate(body.validTo);
  const dateError = validateDateRange(validFrom, validTo);
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const lat = normalizeNullableNumber(body.lat);
  const lng = normalizeNullableNumber(body.lng);
  const coordError = validateCoordinates(lat, lng);
  if (coordError) {
    return NextResponse.json({ error: coordError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('territories')
    .insert({
      name,
      active: body.active ?? true,
      valid_from: validFrom,
      valid_to: validTo,
      lat,
      lng,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, territory: data });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    id?: string;
    name?: string;
    active?: boolean;
    validFrom?: string | null;
    validTo?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  };

  const id = String(body.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID territorio richiesto.' }, { status: 400 });
  }

  const name = normalizeNullableString(body.name);
  if (!name) {
    return NextResponse.json({ error: 'Nome territorio richiesto.' }, { status: 400 });
  }

  const validFrom = normalizeNullableDate(body.validFrom);
  const validTo = normalizeNullableDate(body.validTo);
  const dateError = validateDateRange(validFrom, validTo);
  if (dateError) {
    return NextResponse.json({ error: dateError }, { status: 400 });
  }

  const lat = normalizeNullableNumber(body.lat);
  const lng = normalizeNullableNumber(body.lng);
  const coordError = validateCoordinates(lat, lng);
  if (coordError) {
    return NextResponse.json({ error: coordError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('territories')
    .update({
      name,
      active: body.active ?? true,
      valid_from: validFrom,
      valid_to: validTo,
      lat,
      lng,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, territory: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get('id') ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID territorio richiesto.' }, { status: 400 });
  }

  const [{ count: assignmentCount, error: assignmentError }, { count: appointmentCount, error: appointmentError }] = await Promise.all([
    supabaseAdmin
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('territory_id', id),
    supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('territorio_id', id),
  ]);

  if (assignmentError || appointmentError) {
    return NextResponse.json({
      error: assignmentError?.message ?? appointmentError?.message ?? 'Errore verifica utilizzo territorio.',
    }, { status: 500 });
  }

  const totalUsage = Number(assignmentCount ?? 0) + Number(appointmentCount ?? 0);
  if (totalUsage > 0) {
    return NextResponse.json({
      error: 'Il territorio e gia utilizzato in cronoprogramma o negli appuntamenti. Disattivalo o chiudi la validita invece di eliminarlo.',
    }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('territories')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
