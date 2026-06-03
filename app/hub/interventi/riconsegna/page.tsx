import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { resolveUserRole } from '@/lib/moduleAccess';
import RiconsegnaClient, { type MisuratoreRow } from '@/components/modules/interventi/RiconsegnaClient';

export const dynamic = 'force-dynamic';

export default async function RiconsegnaPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') redirect('/hub');

  const { data: rows } = await supabase
    .from('misuratori_riconsegna')
    .select('id, matricola, odl, contratto, utenza, stato, data_rimozione')
    .in('stato', ['in_custodia', 'in_riepilogo'])
    .order('data_rimozione', { ascending: true });

  return <RiconsegnaClient misuratori={(rows ?? []) as MisuratoreRow[]} />;
}
