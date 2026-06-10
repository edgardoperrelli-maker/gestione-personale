import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import HotelClient from './HotelClient';
import type { Hotel, Territory } from '@/types';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

export default async function HotelPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isAdminPlus = canManageUsers(resolveAssignableRole(profile?.role, user?.app_metadata?.role));

  const [{ data: hotelsRaw }, { data: territories }] = await Promise.all([
    supabase
      .from('hotels')
      .select('*, territory:territories(id,name), room_prices:hotel_room_prices(id,hotel_id,room_type,price_per_night,dinner_price_per_person,notes)')
      .order('name'),
    supabase
      .from('territories')
      .select('id,name,active')
      .order('name'),
  ]);

  return (
    <HotelClient
      initialHotels={(hotelsRaw ?? []) as Hotel[]}
      territories={(territories ?? []) as Territory[]}
      isAdminPlus={isAdminPlus}
    />
  );
}
