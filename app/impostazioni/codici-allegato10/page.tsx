import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import CodiciAllegato10Client from './CodiciAllegato10Client';

export const dynamic = 'force-dynamic';

export default async function CodiciAllegato10Page() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data } = await supabase
    .from('allegato10_codici')
    .select('codice, genera_allegato, discovered_at, last_seen_at')
    .order('codice');

  return <CodiciAllegato10Client initialCodici={data ?? []} />;
}
