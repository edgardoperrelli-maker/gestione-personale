import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole } from '@/lib/moduleAccess';
import type { Territory } from '@/types';
import SopralluoghiHomeClient from './SopralluoghiHomeClient';

export const dynamic = 'force-dynamic';

export default async function SopralluoghiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: territories }] = await Promise.all([
    user
      ? supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('territories')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  const role = resolveUserRole(profile?.role, user?.app_metadata?.role);

  return (
    <SopralluoghiHomeClient
      territories={(territories ?? []) as Territory[]}
      canManage={role === 'admin'}
    />
  );
}
