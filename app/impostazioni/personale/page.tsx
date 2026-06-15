import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import PersonaleClient from './PersonaleClient';
import type { Staff, Territory } from '@/types';

export const dynamic = 'force-dynamic';

export default async function PersonalePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const [{ data: staff }, { data: territories }, { data: ranges }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng, home_territory_id, cost_center')
      .order('display_name', { ascending: true }),
    supabase
      .from('territories')
      .select('id, name, active')
      .order('name', { ascending: true }),
    supabase.from('staff_cost_center_ranges').select('id, staff_id, cost_center, valid_from, valid_to'),
  ]);

  const rangesByStaff: Record<string, { cost_center: string; valid_from: string; valid_to: string | null }[]> = {};
  for (const r of (ranges ?? []) as { staff_id: string; cost_center: string; valid_from: string; valid_to: string | null }[]) {
    (rangesByStaff[r.staff_id] ??= []).push({ cost_center: r.cost_center, valid_from: r.valid_from, valid_to: r.valid_to });
  }

  return (
    <PersonaleClient
      initialStaff={(staff ?? []) as Staff[]}
      territories={(territories ?? []) as Territory[]}
      initialRanges={rangesByStaff}
    />
  );
}
