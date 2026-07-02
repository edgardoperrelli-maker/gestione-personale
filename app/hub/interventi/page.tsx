// app/hub/interventi/page.tsx
// Pagina unica del modulo Interventi: la consultazione "Storico interventi".
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { canManageUsers, resolveAssignableRole, canEditStorico } from '@/lib/moduleAccess';
import StoricoInterventiClient from '@/components/modules/interventi/StoricoInterventiClient';
import RiconciliazioneBanner from '@/components/modules/interventi/RiconciliazioneBanner';

export const dynamic = 'force-dynamic';

export default async function InterventiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  // Solo gli admin_plus possono MODIFICARE; tutti gli abilitati al modulo vedono tabella + foto.
  const role = resolveAssignableRole(profile?.role, user?.app_metadata?.role);
  const isAdminPlus = canManageUsers(role);
  const puoModificare = canEditStorico(role, user?.app_metadata);

  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, display_name')
    .order('display_name', { ascending: true });
  const staff = ((staffRows ?? []) as Array<{ id: string; display_name: string }>);

  return (
    <main className="w-full space-y-4 px-4 py-6">
      {isAdminPlus && <RiconciliazioneBanner />}
      <StoricoInterventiClient staff={staff} isAdminPlus={isAdminPlus} puoModificare={puoModificare} />
    </main>
  );
}
