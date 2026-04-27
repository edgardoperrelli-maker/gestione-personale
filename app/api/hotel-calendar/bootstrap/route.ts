import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const [{ data: hotels, error: hotelsError }, { data: staff, error: staffError }, { data: territories, error: territoriesError }] = await Promise.all([
    supabaseAdmin
      .from('hotels')
      .select('*, territory:territories(id,name), room_prices:hotel_room_prices(id,hotel_id,room_type,price_per_night,dinner_price_per_person,notes)')
      .order('name'),
    supabaseAdmin
      .from('staff')
      .select('id, display_name, home_territory_id')
      .order('display_name'),
    supabaseAdmin
      .from('territories')
      .select('id, name, active')
      .order('name'),
  ]);

  const error = hotelsError ?? staffError ?? territoriesError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    hotels: hotels ?? [],
    staff: staff ?? [],
    territories: territories ?? [],
  });
}
