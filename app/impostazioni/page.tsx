/* Hallmark · redesign · launcher Impostazioni · sistema: Cockpit (DESIGN.md)
 * card via primitivo condiviso ModuleTile (stessa grammatica dell'hub) · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import ModuleTile from '@/components/ui/ModuleTile';
import ObjectHeader from '@/components/ui/ObjectHeader';
import type { ReactNode } from 'react';
import {
  Ban,
  Building2,
  Contact,
  Database,
  FileSpreadsheet,
  FileText,
  Hotel,
  List,
  Map,
  Tags,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

// Icone da `lucide-react`, stesso linguaggio a linee di `moduleIcons.tsx`
// (tratto 1.6, DESIGN.md §7). Qui l'import è diretto perché queste sono le
// sotto-pagine di configurazione, non voci di navigazione in APP_MODULES: non
// passano da sidebar / hub / ⌘K, quindi non c'è la lista unica da non divergere.
const ICON_PROPS = { className: 'h-5 w-5', strokeWidth: 1.6 } as const;

const MODULES: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  requiresAdminPlus?: boolean;
}[] = [
  {
    href: '/impostazioni/utenze',
    title: 'Utenze',
    description: 'Password, ruoli e moduli visibili per ogni utente di accesso.',
    icon: <UsersRound {...ICON_PROPS} />,
    requiresAdminPlus: true,
  },
  {
    href: '/impostazioni/personale',
    title: 'Personale',
    description: 'Validità e indirizzo di partenza degli operatori del cronoprogramma.',
    icon: <Contact {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/territori',
    title: 'Territori',
    description: 'Territori, coordinate mappa e validità, condivisi con cronoprogramma e mappa.',
    icon: <Map {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/gruppo-attivita',
    title: 'Gruppo attività',
    description: 'Elenco attività di cronoprogramma, mappa e sopralluoghi (non è la tassonomia import).',
    icon: <List {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/attivita-tassonomia',
    title: 'Tassonomia attività',
    description: 'Descrizioni e gruppi validi per import, template e inserimenti manuali.',
    icon: <Tags {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/zone-ztl',
    title: 'Zone ZTL',
    description: 'Zone a traffico limitato, CAP e operatori autorizzati.',
    icon: <Ban {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/contratti',
    title: 'Contratti',
    description: 'Commesse dei committenti: territori di copertura, prezzi e attività.',
    icon: <Building2 {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/hotel',
    title: 'Hotel',
    description: 'Strutture per le trasferte: territorio, email e prezzi per tipologia camera.',
    icon: <Hotel {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/codici-allegato10',
    title: 'Codici Allegato 10',
    description: 'Codici servizio che generano automaticamente il verbale Word.',
    icon: <FileText {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/azioni-operatori',
    title: 'Azioni operatori',
    description: 'Committente → gruppo → azioni dei flussi compilati dai tecnici.',
    icon: <Workflow {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/risanamento-misuratori',
    title: 'Estrazione misuratori',
    description: "Importa l'estrazione misuratori (Excel/CSV) del risanamento colonne.",
    icon: <FileSpreadsheet {...ICON_PROPS} />,
  },
  {
    href: '/impostazioni/template-master',
    title: 'Master ODL template',
    description: "File master del template di import: l'ODL scritto compila da sé la riga.",
    icon: <Database {...ICON_PROPS} />,
  },
];

export default async function ImpostazioniPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isAdminPlus = canManageUsers(resolveAssignableRole(profile?.role, user?.app_metadata?.role));
  const modules = MODULES.filter((module) => !module.requiresAdminPlus || isAdminPlus);

  return (
    <div className="space-y-6">
      <ObjectHeader title="Impostazioni" sub="Gestisci la configurazione dell'app e gli accessi degli utenti." />

      <div className="grid gap-3 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-3 min-[1536px]:grid-cols-4 min-[2000px]:grid-cols-5">
        {modules.map((module) => (
          <ModuleTile
            key={module.href}
            href={module.href}
            title={module.title}
            description={module.description}
            icon={module.icon}
            descriptionLines={2}
            titleClassName="text-sm"
          />
        ))}
      </div>
    </div>
  );
}
