import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

const MODULES = [
  {
    href: '/impostazioni/utenze',
    title: 'Utenze',
    description: 'Gestisci password, ruoli e moduli visibili per ogni utente di accesso.',
    icon: 'U',
    requiresAdminPlus: true,
  },
  {
    href: '/impostazioni/personale',
    title: 'Personale',
    description: 'Definisci validita e indirizzo di partenza degli operatori del cronoprogramma.',
    icon: 'P',
  },
  {
    href: '/impostazioni/territori',
    title: 'Territori',
    description: 'Gestisci territori, coordinate mappa e validita temporale condivisa con cronoprogramma e mappa.',
    icon: 'T',
  },
  {
    href: '/impostazioni/gruppo-attivita',
    title: 'Gruppo Attivita',
    description: 'Gestisci elenco attivita condiviso da cronoprogramma, mappa e sopralluoghi (non e la tassonomia import).',
    icon: 'A',
  },
  {
    href: '/impostazioni/attivita-tassonomia',
    title: 'Tassonomia attività',
    description: 'Descrizioni e gruppi attività validi per import, template e inserimenti manuali (motore tassonomia).',
    icon: 'X',
  },
  {
    href: '/impostazioni/zone-ztl',
    title: 'Zone ZTL',
    description: 'Definisci zone a traffico limitato, CAP e operatori autorizzati.',
    icon: 'Z',
  },
  {
    href: '/impostazioni/hotel',
    title: 'Hotel',
    description: 'Strutture ricettive per le trasferte: territorio di riferimento, email e prezzi correnti per tipologia camera.',
    icon: 'H',
  },
  {
    href: '/impostazioni/codici-allegato10',
    title: 'Codici Allegato 10',
    description: 'Seleziona i codici servizio per i quali viene generato automaticamente il verbale Word.',
    icon: 'W',
  },
  {
    href: '/impostazioni/azioni-operatori',
    title: 'Azioni operatori',
    description: 'Committente → gruppo attività → azioni dei flussi compilati dai tecnici (sostituisce i Template rapportini).',
    icon: 'F',
  },
  {
    href: '/impostazioni/risanamento-misuratori',
    title: 'Estrazione misuratori',
    description: 'Importa l\'estrazione misuratori (Excel/CSV) usata dal flusso risanamento colonne.',
    icon: 'M',
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
      <div>
        <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Impostazioni</h1>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Gestisci la configurazione dell&apos;app e gli accessi agli utenti
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary-soft)] text-2xl font-bold text-[var(--brand-primary)]">
              {module.icon}
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--brand-text-main)]">{module.title}</h2>
            <p className="mb-4 text-sm text-[var(--brand-text-muted)]">{module.description}</p>
            <div className="flex items-center text-sm font-semibold text-[var(--brand-primary)]">
              Gestisci
              <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
