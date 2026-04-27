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

function normalizeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    hotel_id?: unknown;
    room_type?: unknown;
    price_per_night?: unknown;
    dinner_price_per_person?: unknown;
    notes?: unknown;
  };

  const hotelId = normalizeString(body.hotel_id);
  const roomType = normalizeString(body.room_type);
  if (!hotelId || !roomType) {
    return NextResponse.json({ error: 'hotel_id e room_type richiesti.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('hotel_room_prices')
    .insert({
      hotel_id: hotelId,
      room_type: roomType,
      price_per_night: normalizeNumber(body.price_per_night),
      dinner_price_per_person: body.dinner_price_per_person === '' ? null : body.dinner_price_per_person ?? null,
      notes: normalizeString(body.notes),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    id?: unknown;
    room_type?: unknown;
    price_per_night?: unknown;
    dinner_price_per_person?: unknown;
    notes?: unknown;
  };

  const id = normalizeString(body.id);
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.room_type !== undefined) {
    const roomType = normalizeString(body.room_type);
    if (!roomType) return NextResponse.json({ error: 'Tipologia richiesta.' }, { status: 400 });
    patch.room_type = roomType;
  }
  if (body.price_per_night !== undefined) patch.price_per_night = normalizeNumber(body.price_per_night);
  if (body.dinner_price_per_person !== undefined) {
    patch.dinner_price_per_person = body.dinner_price_per_person === '' ? null : body.dinner_price_per_person ?? null;
  }
  if (body.notes !== undefined) patch.notes = normalizeString(body.notes);

  const { data, error } = await supabaseAdmin
    .from('hotel_room_prices')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { id?: unknown };
  const id = normalizeString(body.id);
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('hotel_room_prices')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
