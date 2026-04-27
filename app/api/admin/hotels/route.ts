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
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') return NextResponse.json({ error: 'Solo admin.' }, { status: 403 });
  return true;
}

function normalizeString(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function normalizeStars(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
}

const hotelSelect = '*, territory:territories(id,name), room_prices:hotel_room_prices(id,hotel_id,room_type,price_per_night,dinner_price_per_person,notes)';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('hotels')
    .select(hotelSelect)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hotels: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    name?: unknown;
    email?: unknown;
    territory_id?: unknown;
    stars?: unknown;
  };

  const name = normalizeString(body.name);
  if (!name) return NextResponse.json({ error: 'Nome richiesto.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('hotels')
    .insert({
      name,
      email: normalizeString(body.email),
      territory_id: normalizeString(body.territory_id),
      stars: normalizeStars(body.stars) ?? 3,
    })
    .select(hotelSelect)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hotel: data });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    territory_id?: unknown;
    active?: unknown;
    stars?: unknown;
  };

  const id = normalizeString(body.id);
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = normalizeString(body.name);
    if (!name) return NextResponse.json({ error: 'Nome richiesto.' }, { status: 400 });
    patch.name = name;
  }
  if (body.email !== undefined) patch.email = normalizeString(body.email);
  if (body.territory_id !== undefined) patch.territory_id = normalizeString(body.territory_id);
  if (body.active !== undefined) patch.active = body.active === true;
  if (body.stars !== undefined) {
    const stars = normalizeStars(body.stars);
    if (stars === null) return NextResponse.json({ error: 'Punteggio stelle non valido.' }, { status: 400 });
    patch.stars = stars;
  }

  const { data, error } = await supabaseAdmin
    .from('hotels')
    .update(patch)
    .eq('id', id)
    .select(hotelSelect)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hotel: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { id?: unknown };
  const id = normalizeString(body.id);
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('hotels')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
