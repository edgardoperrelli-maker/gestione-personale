import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';

export const dynamic = 'force-dynamic';

/**
 * Landing del modulo Misuratori: si sceglie la commessa, poi si lavora sul suo registro.
 *
 * Era il registro ACEA montato nudo su questa route — giusto finché la commessa era una.
 * Con AcquaLatina i registri sono due (stesso motore `MisuratoriClient`, tabella ed endpoint
 * separati), e la scelta è una vista di modulo: foglietta con route dedicata e breadcrumb di
 * rientro (DESIGN.md §7bis), non un filtro in pagina. Il registro ACEA vive ora in
 * `/hub/misuratori/acea`; quello AcquaLatina resta nella sua casa canonica
 * `/hub/acqualatina/misuratori` — il motore è uno, le porte d'ingresso possono essere due,
 * ma la PAGINA di ogni registro è una sola.
 */
export default async function MisuratoriPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('misuratori')) redirect('/hub');

  return (
    <AuthGate>
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Misuratori' }]} />
        <ObjectHeader
          title="Misuratori rimossi"
          sub="I contatori smontati in campo, dal deposito alla riconsegna: un registro per commessa."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FogliettaCard
            href="/hub/misuratori/acea"
            title="ACEA"
            description="Registro dei rimossi ACEA, col ricalcolo dalla consuntivazione"
            icon={MODULE_ICONS.acea}
          />
          {/*
            Solo per chi ha il modulo AcquaLatina: la foglietta porta alla casa canonica del
            registro (`/hub/acqualatina/misuratori`), che sta dietro il SUO gate. Una carta che
            atterra su un redirect è peggio di una carta che non c'è — e gli admin, che sono
            il pubblico vero di questa pagina, il modulo ce l'hanno sempre (requiresAdminRole).
          */}
          {allowedModules.includes('acqualatina') && (
            <FogliettaCard
              href="/hub/acqualatina/misuratori"
              title="AcquaLatina"
              description="Contatori smontati in campo, dal deposito alla riconsegna al committente"
              icon={MODULE_ICONS.acqualatina}
            />
          )}
        </div>
      </div>
    </AuthGate>
  );
}
