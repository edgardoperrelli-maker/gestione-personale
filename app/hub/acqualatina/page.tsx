import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';

export const dynamic = 'force-dynamic';

// Landing della commessa AcquaLatina — pattern «foglietta» (DESIGN.md §7bis): una card
// per vista. Le viste che la commessa richiederà (produzione, SAL) si aggiungono qui senza
// toccare la navigazione.
const VISTE = [
  {
    href: '/hub/acqualatina/pianificazione',
    title: 'Pianificazione sostituzioni',
    description: 'Il master di Terracina in tabella: esecutore e giorno, rapportini in modale',
  },
  {
    href: '/hub/acqualatina/misuratori',
    title: 'Misuratori rimossi',
    description: 'Contatori smontati in campo, dal deposito alla riconsegna al committente',
  },
];

export default async function AcqualatinaPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('acqualatina')) redirect('/hub');

  return (
    <AuthGate>
      <div className="space-y-4">
        <div>
          <Breadcrumb items={[{ label: 'AcquaLatina' }]} />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">
            AcquaLatina
          </h1>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
            Sostituzione misuratori — Terracina.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VISTE.map((v) => (
            <FogliettaCard key={v.href} href={v.href} title={v.title} description={v.description} />
          ))}
        </div>
      </div>
    </AuthGate>
  );
}
