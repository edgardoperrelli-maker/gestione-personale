import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import TerritoriClient from './TerritoriClient';
import type { Territory } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TerritoriPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: territories } = await supabase
    .from('territories')
    .select('*')
    .order('name', { ascending: true });

  return <TerritoriClient initialTerritories={(territories ?? []) as Territory[]} />;
}
