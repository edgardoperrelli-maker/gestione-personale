import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { StaggerGrid } from '@/components/layout/StaggerGrid';
import { APP_MODULES, getAllowedModulesForUser, type AppModuleKey } from '@/lib/moduleAccess';

type ModuleCardConfig = {
  icon: React.ReactNode;
  badge?: string;
  badgeStyle?: string;
};

const moduleCards: Record<AppModuleKey, ModuleCardConfig> = {
  dashboard: {
    badge: 'Core',
    badgeStyle: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 12h7v9H3z" />
        <path d="M14 3h7v18h-7z" />
      </svg>
    ),
  },
  'hotel-calendar': {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 2v4M16 2v4" />
      </svg>
    ),
  },
  smartracker: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12a8 8 0 1 0 16 0" />
        <path d="M12 4v8l4 2" />
      </svg>
    ),
  },
  rapportini: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M15 2v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  mappa: {
    badge: 'Nuovo',
    badgeStyle: 'bg-green-100 text-green-700',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  impostazioni: {
    badge: 'Admin',
    badgeStyle: 'bg-amber-100 text-amber-700',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.04A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.06 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9c0 .67.4 1.28 1.03 1.56H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.35 15Z" />
      </svg>
    ),
  },
};

export const dynamic = 'force-dynamic';

export default async function HubPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  const allowedModules = user ? getAllowedModulesForUser(user.app_metadata, profile?.role) : [];
  const modules = APP_MODULES.filter((module) => allowedModules.includes(module.key));
  const cardThemes = [
    {
      card: 'bg-[var(--kpi-rosso-bg)] text-[var(--kpi-rosso-text)]',
      icon: 'bg-white/70 text-[var(--kpi-rosso-icon)]',
      badge: 'bg-white/75 text-[var(--kpi-rosso-text)]',
      link: 'text-[var(--kpi-rosso-text)]',
      border: 'border-[var(--brand-primary-border)]',
    },
    {
      card: 'bg-[var(--kpi-giallo-bg)] text-[var(--kpi-giallo-text)]',
      icon: 'bg-white/70 text-[var(--kpi-giallo-icon)]',
      badge: 'bg-white/75 text-[var(--kpi-giallo-text)]',
      link: 'text-[var(--kpi-giallo-text)]',
      border: 'border-[var(--brand-primary-border)]',
    },
    {
      card: 'bg-[var(--kpi-terracotta-bg)] text-[var(--kpi-terracotta-text)]',
      icon: 'bg-white/70 text-[var(--kpi-terracotta-icon)]',
      badge: 'bg-white/75 text-[var(--kpi-terracotta-text)]',
      link: 'text-[var(--kpi-terracotta-text)]',
      border: 'border-[var(--brand-primary-border)]',
    },
    {
      card: 'bg-[var(--kpi-grafite-bg)] text-[var(--kpi-grafite-text)]',
      icon: 'bg-white/70 text-[var(--kpi-grafite-icon)]',
      badge: 'bg-white/75 text-[var(--kpi-grafite-text)]',
      link: 'text-[var(--kpi-grafite-text)]',
      border: 'border-[var(--brand-border-strong)]',
    },
  ] as const;

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Hub Moduli</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Accedi rapidamente ai moduli operativi disponibili per questa utenza.
        </p>
      </header>

      <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module, index) => {
          const card = moduleCards[module.key];
          const theme = cardThemes[index % cardThemes.length];
          return (
            <Link
              key={module.key}
              href={module.href}
              className={`group flex h-full flex-col rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] ${theme.card} ${theme.border}`}
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${theme.icon}`}>
                  {card.icon}
                </div>
                {card.badge && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${card.badgeStyle ?? theme.badge}`}>
                    {card.badge}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <h2 className="text-lg font-semibold">{module.label}</h2>
                <p className="mt-1 text-sm text-current/75">{module.description}</p>
              </div>

              <div className={`mt-auto pt-4 flex items-center gap-2 text-sm font-semibold ${theme.link}`}>
                <span>Apri</span>
                <span className="transition-transform group-hover:translate-x-1">-&gt;</span>
              </div>
            </Link>
          );
        })}
      </StaggerGrid>
    </main>
  );
}
