import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { COST_CENTERS } from '@/constants/cost-centers';

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

function normalizeCostCenter(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return (COST_CENTERS as string[]).includes(v) ? v : '__invalid__';
}

type RangeInput = { cost_center?: unknown; valid_from?: unknown; valid_to?: unknown };
function normalizeRanges(
  input: unknown
): { ok: true; rows: { cost_center: string; valid_from: string; valid_to: string | null }[] } | { ok: false } {
  if (input === undefined) return { ok: true, rows: [] };
  if (!Array.isArray(input)) return { ok: false };
  const rows: { cost_center: string; valid_from: string; valid_to: string | null }[] = [];
  for (const raw of input as RangeInput[]) {
    const cc = String(raw?.cost_center ?? '').trim();
    const from = String(raw?.valid_from ?? '').trim();
    const to = String(raw?.valid_to ?? '').trim();
    if (!(COST_CENTERS as string[]).includes(cc)) return { ok: false };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false };
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false };
    if (to && from > to) return { ok: false };
    rows.push({ cost_center: cc, valid_from: from, valid_to: to || null });
  }
  return { ok: true, rows };
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

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    id?: string;
    validFrom?: string | null;
    validTo?: string | null;
    startAddress?: string | null;
    startCap?: string | null;
    startCity?: string | null;
    startLat?: number | null;
    startLng?: number | null;
    homeAddress?: string | null;
    homeCap?: string | null;
    homeCity?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
    homeTerritoryId?: string | null;
    costCenter?: string | null;
    costCenterRanges?: unknown;
  };

  const id = String(body.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID personale richiesto.' }, { status: 400 });
  }

  const validFrom = normalizeNullableDate(body.validFrom);
  const validTo = normalizeNullableDate(body.validTo);
  if (validFrom === '' || validTo === '') {
    return NextResponse.json({ error: 'Formato data non valido. Usa YYYY-MM-DD.' }, { status: 400 });
  }
  if (validFrom && validTo && validFrom > validTo) {
    return NextResponse.json({ error: 'La data fine validita non puo precedere la data inizio.' }, { status: 400 });
  }

  const startLat = normalizeNullableNumber(body.startLat);
  const startLng = normalizeNullableNumber(body.startLng);
  if (Number.isNaN(startLat) || Number.isNaN(startLng)) {
    return NextResponse.json({ error: 'Coordinate di partenza non valide.' }, { status: 400 });
  }

  const homeLat = normalizeNullableNumber(body.homeLat);
  const homeLng = normalizeNullableNumber(body.homeLng);
  // Se casa non è compilata, homeLat e homeLng sono null → ok, salviamo null
  // Se casa è compilata ma le coordinate sono NaN → errore (geocodificazione fallita)
  const hasHomeAddress = !!(body.homeAddress || body.homeCap || body.homeCity);
  if (hasHomeAddress && (Number.isNaN(homeLat) || Number.isNaN(homeLng))) {
    return NextResponse.json({ error: 'Indirizzo casa compilato ma geocodificazione fallita.' }, { status: 400 });
  }

  const cc = normalizeCostCenter(body.costCenter);
  if (cc === '__invalid__') {
    return NextResponse.json({ error: 'Centro di costo non valido.' }, { status: 400 });
  }
  const rangesRes = normalizeRanges(body.costCenterRanges);
  if (!rangesRes.ok) {
    return NextResponse.json({ error: 'Periodi centro di costo non validi.' }, { status: 400 });
  }

  const patch = {
    valid_from: validFrom,
    valid_to: validTo,
    start_address: normalizeNullableString(body.startAddress),
    start_cap: normalizeNullableString(body.startCap),
    start_city: normalizeNullableString(body.startCity),
    start_lat: startLat !== null && startLng !== null ? startLat : null,
    start_lng: startLat !== null && startLng !== null ? startLng : null,
    home_address: normalizeNullableString(body.homeAddress),
    home_cap: normalizeNullableString(body.homeCap),
    home_city: normalizeNullableString(body.homeCity),
    home_lat: homeLat,
    home_lng: homeLng,
    home_territory_id: body.homeTerritoryId !== undefined ? (body.homeTerritoryId ?? null) : undefined,
    cost_center: cc,
  };

  const { data, error } = await supabaseAdmin
    .from('staff')
    .update(patch)
    .eq('id', id)
    .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng, home_territory_id, cost_center')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.costCenterRanges !== undefined) {
    await supabaseAdmin.from('staff_cost_center_ranges').delete().eq('staff_id', id);
    if (rangesRes.rows.length > 0) {
      await supabaseAdmin.from('staff_cost_center_ranges').insert(
        rangesRes.rows.map((r) => ({ staff_id: id, cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to }))
      );
    }
  }

  return NextResponse.json({ ok: true, staff: data });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    displayName?: string;
    validFrom?: string | null;
    validTo?: string | null;
    startAddress?: string | null;
    startCap?: string | null;
    startCity?: string | null;
    startLat?: number | null;
    startLng?: number | null;
    homeAddress?: string | null;
    homeCap?: string | null;
    homeCity?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
    homeTerritoryId?: string | null;
    costCenter?: string | null;
    costCenterRanges?: unknown;
  };

  // Validazione displayName
  const displayName = String(body.displayName ?? '').trim();
  if (!displayName) {
    return NextResponse.json({ error: 'Nome operatore richiesto.' }, { status: 400 });
  }

  // Normalizzazione e validazione date
  const validFrom = normalizeNullableDate(body.validFrom);
  const validTo = normalizeNullableDate(body.validTo);
  if (validFrom === '' || validTo === '') {
    return NextResponse.json({ error: 'Formato data non valido. Usa YYYY-MM-DD.' }, { status: 400 });
  }
  if (validFrom && validTo && validFrom > validTo) {
    return NextResponse.json({ error: 'La data fine validità non può precedere la data inizio.' }, { status: 400 });
  }

  // Normalizzazione coordinate magazzino
  const startLat = normalizeNullableNumber(body.startLat);
  const startLng = normalizeNullableNumber(body.startLng);
  if (Number.isNaN(startLat) || Number.isNaN(startLng)) {
    return NextResponse.json({ error: 'Coordinate magazzino non valide.' }, { status: 400 });
  }

  // Normalizzazione coordinate casa
  const homeLat = normalizeNullableNumber(body.homeLat);
  const homeLng = normalizeNullableNumber(body.homeLng);
  // Se casa è compilata, le coordinate devono essere valide
  const hasHomeAddress = !!(body.homeAddress || body.homeCap || body.homeCity);
  if (hasHomeAddress && (Number.isNaN(homeLat) || Number.isNaN(homeLng))) {
    return NextResponse.json({ error: 'Indirizzo casa compilato ma geocodificazione fallita.' }, { status: 400 });
  }

  const cc = normalizeCostCenter(body.costCenter);
  if (cc === '__invalid__') {
    return NextResponse.json({ error: 'Centro di costo non valido.' }, { status: 400 });
  }
  const rangesRes = normalizeRanges(body.costCenterRanges);
  if (!rangesRes.ok) {
    return NextResponse.json({ error: 'Periodi centro di costo non validi.' }, { status: 400 });
  }

  // Insert
  const { data, error } = await supabaseAdmin
    .from('staff')
    .insert({
      display_name: displayName,
      valid_from: validFrom,
      valid_to: validTo,
      start_address: normalizeNullableString(body.startAddress),
      start_cap: normalizeNullableString(body.startCap),
      start_city: normalizeNullableString(body.startCity),
      start_lat: startLat,
      start_lng: startLng,
      home_address: normalizeNullableString(body.homeAddress),
      home_cap: normalizeNullableString(body.homeCap),
      home_city: normalizeNullableString(body.homeCity),
      home_lat: homeLat,
      home_lng: homeLng,
      home_territory_id: body.homeTerritoryId ?? null,
      cost_center: cc,
    })
    .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng, home_territory_id, cost_center')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (rangesRes.rows.length > 0) {
    await supabaseAdmin.from('staff_cost_center_ranges').insert(
      rangesRes.rows.map((r) => ({ staff_id: data.id, cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to }))
    );
  }

  return NextResponse.json({ ok: true, staff: data });
}
