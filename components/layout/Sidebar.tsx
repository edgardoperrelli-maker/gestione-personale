'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { appNavigation, sectionLabels } from '@/lib/appNavigation';
import type { AppModuleKey } from '@/lib/moduleAccess';
import { MODULE_ICONS, DASHBOARD_HOME_ICON } from './moduleIcons';
import { useRichiesteManualiContext } from './RichiesteManualiProvider';

type SidebarProps = {
  allowedModules?: AppModuleKey[];
  collapsed?: boolean;
  /** Chiamata al click su un link: usata per chiudere il drawer su mobile. */
  onNavigate?: () => void;
  /** Se presente, mostra il pulsante per collassare/espandere (solo desktop). */
  onToggleCollapsed?: () => void;
};

function matchesPath(pathname: string, href: string, matchPrefixes?: string[]): boolean {
  const prefixes = matchPrefixes?.length ? matchPrefixes : [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function Sidebar({
  allowedModules,
  collapsed = false,
  onNavigate,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { count: nAttesa } = useRichiesteManualiContext();
  const badgeAttesa = nAttesa > 0 ? (
    <span
      aria-label={`${nAttesa} in attesa`}
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white ${collapsed ? 'absolute right-1 top-1' : 'ml-auto'}`}
      style={{ backgroundColor: 'var(--danger)' }}
    >
      {nAttesa > 99 ? '99+' : nAttesa}
    </span>
  ) : null;

  const visibleItems = appNavigation.filter((item) => {
    if (item.key === 'hub') return false; // la home è la voce brand in alto
    return !allowedModules || allowedModules.includes(item.key as AppModuleKey);
  });

  const moduleItems = visibleItems.filter((item) => item.section === 'modules');
  const systemItems = visibleItems.filter((item) => item.section === 'system');

  // La home Dashboard è attiva solo su /hub esatto (i moduli figli hanno il loro stato)
  const homeActive = pathname === '/hub';
  const accountActive = pathname === '/account/password' || pathname.startsWith('/account/');

  const renderLink = (
    href: string,
    label: string,
    icon: React.ReactNode,
    active: boolean,
    trailing?: React.ReactNode,
  ) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
        collapsed ? 'justify-center' : ''
      } ${active ? 'bg-[var(--brand-nav-active-bg)] font-semibold' : 'hover:bg-[var(--brand-primary-soft)]'}`}
      style={{ color: active ? 'var(--brand-primary)' : 'var(--brand-text-main)' }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
      {trailing}
    </Link>
  );

  return (
    <div
      className={`flex h-full flex-col border-r bg-[var(--brand-surface)] ${collapsed ? 'w-16' : 'w-60'}`}
      style={{ borderColor: 'var(--brand-border)' }}
    >
      {/* Brand / Dashboard home */}
      <div className="flex items-center gap-2 px-3 py-4">
        <Link
          href="/hub"
          onClick={onNavigate}
          title="Dashboard"
          className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[var(--brand-primary-soft)] ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ color: 'var(--brand-primary)' }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary-soft)]">
            {DASHBOARD_HOME_ICON}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-extrabold tracking-[0.08em]">PLENZICH</span>
              <span className="truncate text-[9px] tracking-[0.24em] text-[var(--brand-text-muted)]">
                DASHBOARD
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {renderLink('/hub', 'Dashboard', DASHBOARD_HOME_ICON, homeActive)}

        {moduleItems.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-subtle)]">
                {sectionLabels.modules}
              </p>
            )}
            {moduleItems.map((item) =>
              renderLink(
                item.href,
                item.label,
                MODULE_ICONS[item.key as AppModuleKey],
                matchesPath(pathname, item.href, item.matchPrefixes),
                item.key === 'lista-attesa' ? badgeAttesa : undefined,
              ),
            )}
          </>
        )}

        {systemItems.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-subtle)]">
                {sectionLabels.system}
              </p>
            )}
            {systemItems.map((item) =>
              renderLink(
                item.href,
                item.label,
                MODULE_ICONS[item.key as AppModuleKey],
                matchesPath(pathname, item.href, item.matchPrefixes),
              ),
            )}
          </>
        )}

        <div className="my-2 border-t" style={{ borderColor: 'var(--brand-border)' }} />
        {renderLink(
          '/account/password',
          'Account',
          (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          ),
          accountActive,
        )}
      </nav>

      {/* Collapse toggle (solo desktop) */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          title={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          className={`m-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition hover:bg-[var(--brand-primary-soft)] ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={collapsed ? 'rotate-180' : ''}
            aria-hidden="true"
          >
            <path d="M15 18 9 12l6-6" />
          </svg>
          {!collapsed && <span>Comprimi</span>}
        </button>
      )}
    </div>
  );
}
