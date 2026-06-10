import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';
import UtenzeClient from './UtenzeClient';

export const dynamic = 'force-dynamic';

export default async function UtenzePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!canManageUsers(resolveAssignableRole(profile?.role, user.app_metadata?.role))) {
    redirect('/impostazioni');
  }
  return <UtenzeClient />;
}
