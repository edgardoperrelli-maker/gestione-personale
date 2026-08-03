import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole, resolveAssignableRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import MisuratoriClient from '@/components/modules/misuratori/MisuratoriClient';

export const dynamic = 'force-dynamic';

// Stesso registro del modulo Misuratori (ACEA), su tabella e endpoint separati.
//
// «Ricalcola» ACCESO dal 2026-08-03, e non per comodità: il registro aveva UNA sola porta
// d'ingresso — l'upsert alla chiusura del rapportino — e quella porta era murata. L'indice di
// unicità era parziale, `ON CONFLICT` non lo agganciava, e l'errore non veniva letto: 212
// rapportini chiusi in positivo, registro a zero, nessun segnale. Sistemato l'indice
// (20260803120000), il ricalcolo è quello che recupera il pregresso — stesso motore della
// commessa gemella.
export default async function AcqualatinaMisuratoriPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('acqualatina')) redirect('/hub');
  const isAdminPlus = resolveAssignableRole(profile?.role, user.app_metadata?.role) === 'admin_plus';

  return (
    <AuthGate>
      <MisuratoriClient
        isAdminPlus={isAdminPlus}
        apiBase="/api/acqualatina/misuratori"
        titolo="Misuratori rimossi — AcquaLatina"
        sottotitolo="Contatori smontati in campo, dal deposito alla riconsegna al committente"
        mostraRicalcola
        mostraPdr={false}
        mostraPallet
        // Sentence case (§4): era Title Case, l'ultimo rimasto dopo la ripulitura del PDF ACEA.
        titoloPdf="Registro misuratori rimossi — AcquaLatina"
        // Il rientro mancava anche qui (§7bis): la casa è AcquaLatina, e il breadcrumb lo dice
        // pure a chi arriva dall'altra porta — la landing Misuratori.
        breadcrumb={
          <Breadcrumb
            items={[{ label: 'AcquaLatina', href: '/hub/acqualatina' }, { label: 'Misuratori rimossi' }]}
          />
        }
      />
    </AuthGate>
  );
}
