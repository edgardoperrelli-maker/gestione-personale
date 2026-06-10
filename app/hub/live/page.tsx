import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';
import LiveClient, { type TorreIntervento } from '@/components/modules/live/LiveClient';
import { clampDataLive, minDataLive } from '@/lib/interventi/liveWindow';

export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome (YYYY-MM-DD). */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default async function LivePage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('live')) redirect('/hub');

  const oggi = oggiRoma();
  const data = clampDataLive(sp.data, oggi);

  const PAGE = 1000;
  const rows: TorreIntervento[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('interventi')
      .select('id, odl, nominativo, indirizzo, comune, cap, pdr, matricola_contatore, intervento_tipo, lat, lng, staff_id, stato, esito, esito_motivo, chiuso_at, fascia_oraria, territorio_id')
      .eq('data', data)
      .order('comune', { ascending: true })
      .order('indirizzo', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    const batch = (page ?? []) as TorreIntervento[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const { data: territoriRows } = await supabase.from('territories').select('id, name').order('name', { ascending: true });
  const territori = (territoriRows ?? []) as Array<{ id: string; name: string }>;

  const { data: staffRows } = await supabase.from('staff').select('id, display_name, valid_from, valid_to');
  const operatori = ((staffRows ?? []) as Staff[])
    .filter((s) => isStaffValidOnDay(s, data))
    .map((s) => ({ id: s.id, display_name: s.display_name }));

  return (
    <LiveClient
      data={data}
      minData={minDataLive(oggi)}
      maxData={oggi}
      interventi={rows}
      operatori={operatori}
      territori={territori}
    />
  );
}
