import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import CommittentiClient from './CommittentiClient';
import type { AppuntamentoCommittente } from '@/lib/appuntamenti/committenti';

export const dynamic = 'force-dynamic';

export default async function AppuntamentiCommittentiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  // `territori:appuntamenti_territori(...)` è l'embed della relazione FK.
  // Se le tabelle non esistono ancora (migrazione non applicata), `error` è
  // valorizzato e si degrada a lista vuota: la pagina resta navigabile.
  const { data } = await supabase
    .from('appuntamenti_committenti')
    .select('id, nome, attivo, territori:appuntamenti_territori(id, committente_id, nome, attivo)')
    .order('nome', { ascending: true });

  return <CommittentiClient initial={(data ?? []) as AppuntamentoCommittente[]} />;
}
