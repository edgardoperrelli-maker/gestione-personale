'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { appNavigation, sectionLabels, type NavItem } from '@/lib/appNavigation';

const NAV_ICONS: Record<string, React.ReactNode> = {
  '/hub': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 10v9h12v-9" />
    </svg>
  ),
  '/dashboard': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12h7v9H3z" />
      <path d="M14 3h7v18h-7z" />
    </svg>
  ),
  '/hub/hotel-calendar': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2v4M16 2v4" />
    </svg>
  ),
  '/hub/smartracker': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 12a8 8 0 1 0 16 0" />
      <path d="M12 4v8l4 2" />
    </svg>
  ),
  '/hub/rapportini': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  ),
  '/hub/attrezzature': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16" />
      <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M9 7V4h6v3" />
    </svg>
  ),
  '/hub/mappa': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
};

const getActiveNav = (pathname: string): NavItem | undefined => {
  let best: { item: NavItem; score: number } | null = null;
  appNavigation.forEach((item) => {
    if (pathname === item.href) {
      best = { item, score: 9999 };
      return;
    }
    const matches = item.matchPrefixes?.filter((p) => pathname.startsWith(p)) ?? [];
    if (!matches.length) return;
    const score = Math.max(...matches.map((p) => p.length));
    if (!best || score > best.score) best = { item, score };
  });
  return best?.item;
};

const getParentPath = (pathname: string) => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  const base = segments[0] === 'dashboard' ? 'dashboard' : segments[0] === 'hub' ? 'hub' : null;
  if (!base) return null;
  if (segments.length === 1) return null;
  return '/' + segments.slice(0, -1).join('/');
};

export default function AppShell({
  children,
  roleLabel = 'Operatore',
  userName,
  onLogout,
}: {
  children: React.ReactNode;
  roleLabel?: string;
  userName?: string;
  onLogout?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeNav = useMemo(() => getActiveNav(pathname), [pathname]);
  const pageLabel = activeNav?.label ?? 'Gestione Personale';
  const backHref = getParentPath(pathname);

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <div className="text-white text-xl font-semibold tracking-tight">GestiLab</div>
        <div className="text-xs font-medium text-blue-300/80">Gestione Personale</div>
      </div>

      <div className="mt-8 flex-1 overflow-y-auto px-4 sidebar-scrollbar">
        {Object.keys(sectionLabels).map((sectionKey) => {
          const section = sectionKey as NavItem['section'];
          const items = appNavigation.filter((item) => item.section === section);
          if (!items.length) return null;
          return (
            <div key={section} className="mb-6">
              <div className="px-2 text-[11px] uppercase tracking-widest text-[var(--sidebar-muted)]">
                {sectionLabels[section]}
              </div>
              <div className="mt-2 space-y-1">
                {items.map((item) => {
                  const isActive =
                    pathname === item.href || item.matchPrefixes?.some((p) => pathname.startsWith(p));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                        isActive
                          ? 'border-blue-500/30 bg-blue-500/20 text-white'
                          : 'border-transparent text-[var(--sidebar-text)] hover:bg-white/5'
                      }`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isActive ? 'bg-blue-400' : 'bg-transparent group-hover:bg-blue-300/70'
                        }`}
                      />
                      <span className="flex items-center gap-2">
                        {NAV_ICONS[item.href]}
                        <span>{item.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 text-xs text-[var(--sidebar-muted)]">{userName ?? 'Profilo attivo'}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--brand-bg)]">
      <div className="flex">
        <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen w-[280px] overflow-hidden bg-gradient-to-b from-[var(--sidebar-bg-from)] to-[var(--sidebar-bg-to)] border-r border-[var(--sidebar-border)]">
          <div className="w-[280px]">{sidebar}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-[var(--brand-surface)]/90 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden rounded-lg border border-[var(--brand-border)] p-2"
                aria-label="Apri menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>

              <div className="flex items-center gap-2">
                {backHref && (
                  <button
                    type="button"
                    onClick={() => router.push(backHref)}
                    className="text-sm text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]"
                  >
                    {'\u2190'} Indietro
                  </button>
                )}
                <div>
                  <div className="text-sm text-[var(--brand-text-muted)]">{activeNav?.description}</div>
                  <div className="text-lg font-semibold tracking-tight">{pageLabel}</div>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span className="rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary)]">
                  {roleLabel}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-[var(--brand-border)] px-3 py-1 text-xs hover:bg-[var(--brand-nav-active-bg)]"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-10 pt-6 lg:px-8">{children}</main>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[300px] bg-gradient-to-b from-[var(--sidebar-bg-from)] to-[var(--sidebar-bg-to)]">
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
