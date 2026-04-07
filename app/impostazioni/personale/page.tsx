import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import PersonaleClient from './PersonaleClient';
import type { Staff } from '@/types';

export const dynamic = 'force-dynamic';

export default async function PersonalePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: staff } = await supabase
    .from('staff')
    .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng')
    .order('display_name', { ascending: true });

  return <PersonaleClient initialStaff={(staff ?? []) as Staff[]} />;
}
