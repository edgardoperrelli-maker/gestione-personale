import 'leaflet/dist/leaflet.css';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole } from '@/lib/moduleAccess';
import { filterSopralluoghiActivities } from '@/lib/sopralluoghiActivities';
import RisanamentoClient from './RisanamentoClient';
import type { Activity, Territory } from '@/types';

export const dynamic = 'force-dynamic';

type PageSearchParams = {
  tab?: string;
};

export default async function RisanamentoPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  const role = resolveUserRole(profile?.role, user?.app_metadata?.role);

  const [{ data: territories }, { data: activities }, { data: microareeStats }, { data: pdfGenerati }] = await Promise.all([
    supabase
      .from('territories')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true }),
    supabase
      .from('activities_renamed')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('microaree_stats')
      .select('*')
      .order('microarea', { ascending: true }),
    role === 'admin'
      ? supabase
          .from('sopralluoghi_pdf_generati')
          .select('id, microarea, territorio_id, activity_id, num_civici, data_generazione, stato_registrazione, pdf_url, excel_url')
          .order('data_generazione', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const initialTab = params.tab === 'registrazione' ? 'registrazione' : 'pianificazione';

  return (
    <RisanamentoClient
      territories={(territories ?? []) as Territory[]}
      activities={filterSopralluoghiActivities((activities ?? []) as Activity[])}
      microareeStats={microareeStats ?? []}
      pdfGenerati={pdfGenerati ?? []}
      canManage={role === 'admin'}
      initialTab={initialTab}
    />
  );
}
