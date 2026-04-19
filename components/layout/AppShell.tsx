'use client';

import type * as React from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { appNavigation, sectionLabels, type NavItem } from '@/lib/appNavigation';
import type { AppModuleKey } from '@/lib/moduleAccess';

const NAV_ICONS: Record<string, React.ReactNode> = {
  '/hub': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5L12 4l8 6.5" /><path d="M6 10v9h12v-9" />
    </svg>
  ),
  '/dashboard': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  '/hub/hotel-calendar': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 2v4M16 2v4" />
    </svg>
  ),
  '/hub/smartracker': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  '/hub/rapportini': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5" /><path d="M9 13h6M9 17h6" />
    </svg>
  ),
  '/hub/mappa': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  ),
  '/impostazioni/utenze': (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.04A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.06 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9c0 .67.4 1.28 1.03 1.56H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.35 15Z" />
    </svg>
  ),
};

function matchesPath(pathname: string, item: NavItem): boolean {
  const prefixes = item.matchPrefixes?.length ? item.matchPrefixes : [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function getPageLabel(pathname: string): string {
  const sorted = [...appNavigation].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((item) => matchesPath(pathname, item))?.label ?? 'Gestione Personale';
}

function getBackHref(pathname: string): string | null {
  const roots = new Set(['/dashboard', '/hub', '/']);
  if (roots.has(pathname)) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  return '/' + segments.slice(0, -1).join('/');
}

function SidebarContent({
  pathname,
  roleLabel,
  userName,
  allowedModules,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  roleLabel: string;
  userName?: string;
  allowedModules?: AppModuleKey[];
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const visibleItems = appNavigation.filter((item) => {
    if (item.key === 'hub') return true;
    return !allowedModules || allowedModules.includes(item.key as AppModuleKey);
  });

  const sections = (Object.keys(sectionLabels) as Array<NavItem['section']>)
    .map((section) => ({
      section,
      label: sectionLabels[section],
      items: visibleItems.filter((item) => item.section === section),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[var(--sidebar-border)] px-4 pt-5 pb-4">
        <div className="flex flex-col gap-0.5 text-center">
          <p
            className="text-[18px] font-bold tracking-[0.2em]"
            style={{ color: '#DB2128' }}
          >
            PLENZICH
          </p>
          <p
            className="text-[11px] font-medium tracking-[0.15em]"
            style={{ color: 'var(--sidebar-muted)' }}
          >
            S.p.A.
          </p>
          <p
            className="mt-1 text-[10px] tracking-[0.2em]"
            style={{ color: 'var(--sidebar-muted)' }}
          >
            — GESTIONE PERSONALE —
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-4">
          {sections.map((group) => (
            <div key={group.section} className="flex flex-col gap-1">
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                {group.label}
              </p>
              <LayoutGroup>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = NAV_ICONS[item.href];
                    const active = matchesPath(pathname, item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm transition-all ${
                            active
                              ? 'border-[var(--brand-primary-border)] bg-[var(--brand-nav-active-bg)] text-white'
                              : 'border-transparent text-[var(--sidebar-text)] hover:bg-white/6 hover:text-white'
                          }`}
                        >
                          {active && (
                            <motion.div
                              layoutId="sidebar-active-indicator"
                              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-[var(--brand-primary)]"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all ${
                              active
                                ? 'border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                                : 'border-transparent text-[var(--sidebar-muted)]'
                            }`}
                          >
                            {Icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-medium leading-5 ${active ? 'text-[var(--brand-text-main)]' : ''}`}>
                              {item.label}
                            </span>
                            {item.description && (
                              <span
                                className={`mt-0.5 block truncate text-[11px] leading-snug ${
                                  active ? 'text-[var(--brand-text-muted)]' : 'text-[var(--sidebar-muted)]'
                                }`}
                              >
                                {item.description}
                              </span>
                            )}
                          </span>
                          {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </LayoutGroup>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 space-y-3">
        {userName && <p className="text-xs text-white/35 truncate">{userName}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/75">
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3 py-1.5 text-xs font-medium text-white/65 transition hover:bg-white/8 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Esci
          </button>
        </div>
      </div>
    </div>
  );
}

const SIDEBAR_KEY = 'gp_sidebar_open';

export default function AppShell({
  children,
  roleLabel = 'Operatore',
  userName,
  allowedModules,
  onLogout,
}: {
  children: React.ReactNode;
  roleLabel?: string;
  userName?: string;
  allowedModules?: AppModuleKey[];
  onLogout?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === '0') setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0');
  }, [sidebarOpen]);

  const pageLabel = useMemo(() => getPageLabel(pathname), [pathname]);
  const backHref = useMemo(() => getBackHref(pathname), [pathname]);

  const handleLogout = async () => {
    if (onLogout) { onLogout(); return; }
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--brand-bg)' }}>
      {/* ── Sidebar desktop ── */}
      <aside
        className={`hidden shrink-0 self-start overflow-hidden transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen`}
        style={{
          width: sidebarOpen ? 280 : 0,
          background: 'linear-gradient(180deg, #1A0808 0%, #2C1010 100%)',
          borderRight: sidebarOpen ? '1px solid rgba(255,255,255,0.07)' : 'none',
        }}
      >
        <div style={{ width: 280 }}>
          <SidebarContent
            pathname={pathname}
            roleLabel={roleLabel}
            userName={userName}
            allowedModules={allowedModules}
            onLogout={handleLogout}
          />
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Header */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
        >
          {/* Hamburger mobile */}
          <button
            type="button"
            aria-label="Apri menu"
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center rounded-lg border p-2 transition hover:bg-[var(--brand-primary-soft)] lg:hidden"
            style={{ borderColor: 'var(--brand-border)' }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Sidebar toggle desktop */}
          <button
            type="button"
            aria-label={sidebarOpen ? 'Chiudi sidebar' : 'Apri sidebar'}
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden items-center justify-center rounded-lg border p-2 transition hover:bg-[var(--brand-primary-soft)] lg:flex"
            style={{ borderColor: 'var(--brand-border)' }}
          >
            {sidebarOpen ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><polyline points="15 8 11 12 15 16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><polyline points="13 8 17 12 13 16" />
              </svg>
            )}
          </button>

          <span className="truncate text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            {pageLabel}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {backHref && (
              <button
                type="button"
                onClick={() => router.push(backHref)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--brand-primary-soft)]"
                style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Indietro
              </button>
            )}
            {userName && (
              <span className="hidden max-w-[160px] truncate text-xs sm:block" style={{ color: 'var(--brand-text-muted)' }}>
                {userName}
              </span>
            )}
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
            >
              {roleLabel}
            </span>
            <button
              type="button"
              aria-label="Logout"
              onClick={handleLogout}
              className="hidden items-center justify-center rounded-lg border p-2 transition hover:bg-[var(--brand-primary-soft)] lg:flex"
              style={{ borderColor: 'var(--brand-border)' }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 lg:p-6">{children}</main>
      </div>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[90vw] flex-col shadow-2xl"
              style={{ background: 'linear-gradient(180deg, #1A0808 0%, #2C1010 100%)', borderRight: '1px solid rgba(255,255,255,0.07)' }}
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <span className="text-sm font-semibold text-white">Menu</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center rounded-lg border border-white/20 p-1.5 text-white/60 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <SidebarContent
                pathname={pathname}
                roleLabel={roleLabel}
                userName={userName}
                allowedModules={allowedModules}
                onNavigate={() => setMobileOpen(false)}
                onLogout={handleLogout}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
