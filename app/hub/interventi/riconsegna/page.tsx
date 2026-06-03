import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { resolveUserRole } from '@/lib/moduleAccess';
import RiconsegnaClient, { type ScaricoRow } from '@/components/modules/interventi/RiconsegnaClient';

export const dynamic = 'force-dynamic';

function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default async function RiconsegnaPage({
  searchParams,
}: {
  searchParams: Promise<{ giorno?: string }>;
}) {
  const sp = await searchParams;
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(sp.giorno ?? '') ? (sp.giorno as string) : oggiRoma();

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') redirect('/hub');

  const { data: misRows } = await supabase
    .from('misuratori_riconsegna')
    .select('id, matricola, odl, stato, intervento_id')
    .eq('data_rimozione', giorno)
    .order('matricola', { ascending: true });
  const mis = (misRows ?? []) as Array<{
    id: string;
    matricola: string;
    odl: string | null;
    stato: string;
    intervento_id: string | null;
  }>;

  const intIds = [...new Set(mis.map((m) => m.intervento_id).filter((x): x is string => !!x))];
  const { data: intRows } = intIds.length
    ? await supabase.from('interventi').select('id, staff_id, indirizzo, comune').in('id', intIds)
    : { data: [] };
  const intById = new Map(
    ((intRows ?? []) as Array<{ id: string; staff_id: string | null; indirizzo: string | null; comune: string | null }>).map(
      (i) => [i.id, i],
    ),
  );

  const { data: staffRows } = await supabase.from('staff').select('id, display_name');
  const staffById = new Map(
    ((staffRows ?? []) as Array<{ id: string; display_name: string }>).map((s) => [s.id, s.display_name]),
  );

  const righe: ScaricoRow[] = mis.map((m) => {
    const it = m.intervento_id ? intById.get(m.intervento_id) : null;
    const staffId = it?.staff_id ?? null;
    return {
      id: m.id,
      matricola: m.matricola,
      odl: m.odl,
      stato: m.stato,
      indirizzo: [it?.indirizzo, it?.comune].filter(Boolean).join(', ') || null,
      operatore: staffId ? staffById.get(staffId) ?? `Operatore ${staffId}` : 'Senza operatore',
    };
  });

  return <RiconsegnaClient giorno={giorno} righe={righe} />;
}
