import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import ZtlZoneClient from './ZtlZoneClient';

export const dynamic = 'force-dynamic';

export default async function ZtlZonePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const [{ data: zones }, { data: staff }] = await Promise.all([
    supabase
      .from('ztl_zones')
      .select('id, name, description, cap_list, active, created_at')
      .order('name'),
    supabase
      .from('staff')
      .select('id, display_name')
      .order('display_name'),
  ]);

  const { data: zoneOps } = await supabase
    .from('ztl_zone_operators')
    .select('zone_id, staff_id');

  return (
    <ZtlZoneClient
      initialZones={zones ?? []}
      staff={staff ?? []}
      initialZoneOps={zoneOps ?? []}
    />
  );
}
