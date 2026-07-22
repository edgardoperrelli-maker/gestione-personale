import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

// Icone a linee nello stile di moduleIcons.tsx (stroke currentColor 1.6, round):
// sostituiscono le vecchie icone-lettera ('U', 'P', 'X'…).
const icona = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const MODULES = [
  {
    href: '/impostazioni/utenze',
    title: 'Utenze',
    description: 'Gestisci password, ruoli e moduli visibili per ogni utente di accesso.',
    icon: icona(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M14.8 19a4.6 4.6 0 0 1 5.7-4.4" /></>),
    requiresAdminPlus: true,
  },
  {
    href: '/impostazioni/personale',
    title: 'Personale',
    description: 'Definisci validità e indirizzo di partenza degli operatori del cronoprogramma.',
    icon: icona(<><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></>),
  },
  {
    href: '/impostazioni/territori',
    title: 'Territori',
    description: 'Gestisci territori, coordinate mappa e validità temporale condivisa con cronoprogramma e mappa.',
    icon: icona(<><path d="M12 21s-6.5-5.2-6.5-10.2a6.5 6.5 0 0 1 13 0C18.5 15.8 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></>),
  },
  {
    href: '/impostazioni/gruppo-attivita',
    title: 'Gruppo attività',
    description: 'Gestisci elenco attività condiviso da cronoprogramma, mappa e sopralluoghi (non è la tassonomia import).',
    icon: icona(<><path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" /><circle cx="4.5" cy="6.5" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="17.5" r="1" fill="currentColor" /></>),
  },
  {
    href: '/impostazioni/attivita-tassonomia',
    title: 'Tassonomia attività',
    description: 'Descrizioni e gruppi attività validi per import, template e inserimenti manuali (motore tassonomia).',
    icon: icona(<><path d="M3.5 11.2V5a1.5 1.5 0 0 1 1.5-1.5h6.2a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0l-7.4-7.4a2 2 0 0 1-.6-1.4z" /><circle cx="8" cy="8" r="1.4" /></>),
  },
  {
    href: '/impostazioni/zone-ztl',
    title: 'Zone ZTL',
    description: 'Definisci zone a traffico limitato, CAP e operatori autorizzati.',
    icon: icona(<><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>),
  },
  {
    href: '/impostazioni/hotel',
    title: 'Hotel',
    description: 'Strutture ricettive per le trasferte: territorio di riferimento, email e prezzi correnti per tipologia camera.',
    icon: icona(<><path d="M3 19V8.5L12 4l9 4.5V19" /><path d="M3 19h18" /><path d="M8.5 19v-5h7v5" /><path d="M10 9.5h4" /></>),
  },
  {
    href: '/impostazioni/codici-allegato10',
    title: 'Codici Allegato 10',
    description: 'Seleziona i codici servizio per i quali viene generato automaticamente il verbale Word.',
    icon: icona(<><path d="M7 3.5h7l4.5 4.5v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" /><path d="M14 3.5V8h4.5" /><path d="M9.5 13h6M9.5 16.5h6" /></>),
  },
  {
    href: '/impostazioni/azioni-operatori',
    title: 'Azioni operatori',
    description: 'Committente → gruppo attività → azioni dei flussi compilati dai tecnici (sostituisce i Template rapportini).',
    icon: icona(<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.5 7.8 10.7 16M16.5 7.8 13.3 16M8.2 6h7.6" /></>),
  },
  {
    href: '/impostazioni/risanamento-misuratori',
    title: 'Estrazione misuratori',
    description: "Importa l'estrazione misuratori (Excel/CSV) usata dal flusso risanamento colonne.",
    icon: icona(<><path d="M4.5 14a7.5 7.5 0 0 1 15 0" /><path d="M12 14l3.5-3.5" /><circle cx="12" cy="14" r="1.2" fill="currentColor" /><path d="M4.5 19.5h15" /></>),
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
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">Impostazioni</h1>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Gestisci la configurazione dell&apos;app e gli accessi degli utenti.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--brand-primary-border)] hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] motion-reduce:hover:translate-y-0"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]">
              {module.icon}
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--brand-text-main)]">{module.title}</h2>
            <p className="mb-4 text-sm text-[var(--brand-text-muted)]">{module.description}</p>
            <div className="flex items-center text-sm font-semibold text-[var(--primary-text)]">
              Gestisci
              <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
