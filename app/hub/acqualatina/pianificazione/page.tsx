import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import RegistroAcea from '@/components/modules/acea/RegistroAcea';

export const dynamic = 'force-dynamic';

/**
 * Pianificazione della sostituzione misuratori AcquaLatina (Terracina).
 *
 * È il registro commesse — le stesse mani di Dunning e Limitazioni massive: filtri, griglia alla
 * Excel, pianificazione con cancello sul tabellone (attività CONTATORI), rapportini in modale.
 * Cambia la sorgente: qui gli ordini vengono dal MASTER del committente («Aggiorna dal master»
 * in barra), e la chiusura la scrivono i NOSTRI rapportini — AcquaLatina non ci rimanda niente.
 *
 * Niente `AceaNav` né contatori ACEA: questa vista vive sotto la commessa AcquaLatina, e i
 * numeri di testa dell'altro modulo parlerebbero di un altro committente.
 */
export default async function AcqualatinaPianificazionePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (!getAllowedModulesForUser(user.app_metadata, role).includes('acqualatina')) redirect('/hub');

  // Modulo a schermo pieno, come Dunning e Massive: la tabella prende l'altezza che avanza.
  return (
    <AuthGate>
      <div className="flex h-[calc(100dvh-6rem)] flex-col gap-2">
        <div className="shrink-0">
          <Breadcrumb
            items={[{ label: 'AcquaLatina', href: '/hub/acqualatina' }, { label: 'Pianificazione' }]}
          />
          {/*
            `text-xl`, il gradino delle teste slim (§4): le viste gemelle sullo stesso registro
            full-screen — Dunning, Massive, Collaudo — stanno tutte lì, e questa a text-2xl era
            l'unica a sporgere di un gradino.
          */}
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.015em] text-[var(--brand-text-main)]">
            Sostituzione misuratori — Terracina
          </h1>
        </div>
        <RegistroAcea famiglia="acqualatina" />
      </div>
    </AuthGate>
  );
}
