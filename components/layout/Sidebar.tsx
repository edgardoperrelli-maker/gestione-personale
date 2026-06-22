'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { appNavigation, groupLabels, GROUP_ORDER } from '@/lib/appNavigation';
import type { AppModuleKey } from '@/lib/moduleAccess';
import { MODULE_ICONS, DASHBOARD_HOME_ICON } from './moduleIcons';
import { useRichiesteManualiContext } from './RichiesteManualiProvider';

const RIEPILOGO_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M9 11l3 3 8-8" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const ACCOUNT_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

type SidebarProps = {
  allowedModules?: AppModuleKey[];
  collapsed?: boolean;
  onNavigate?: () => void;
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
  const searchParams = useSearchParams();
  const vistaMappa = searchParams.get('vista');
  const { count: nAttesa } = useRichiesteManualiContext();
  const badgeAttesa = nAttesa > 0 ? (
    <span
      aria-label={`${nAttesa} in attesa`}
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-[var(--on-danger)] ${collapsed ? 'absolute right-1 top-1' : ''}`}
      style={{ backgroundColor: 'var(--status-ko)' }}
    >
      {nAttesa > 99 ? '99+' : nAttesa}
    </span>
  ) : null;

  const visibleItems = appNavigation.filter((item) => {
    if (item.key === 'hub') return false;
    return !allowedModules || allowedModules.includes(item.key as AppModuleKey);
  });

  const homeActive = pathname === '/hub';
  const accountActive = pathname.startsWith('/account/');

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
      className={`group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
        collapsed ? 'justify-center' : ''
      } ${active ? 'bg-[var(--brand-primary-soft)] font-semibold' : 'hover:bg-[var(--brand-surface-muted)]'}`}
      style={{ color: active ? 'var(--primary-text)' : 'var(--brand-text-main)' }}
    >
      {active && !collapsed && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        />
      )}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
      {trailing}
    </Link>
  );

  const renderModuleLinks = (group: (typeof GROUP_ORDER)[number]) =>
    visibleItems
      .filter((item) => item.group === group)
      .flatMap((item) => {
        if (item.key === 'mappa') {
          const suMappa = pathname === '/hub/mappa' || pathname.startsWith('/hub/mappa/');
          return [
            renderLink('/hub/mappa?vista=pianifica', 'Pianificazione', MODULE_ICONS.mappa, suMappa && vistaMappa !== 'riepilogo'),
            renderLink('/hub/mappa?vista=riepilogo', 'Riepilogo rapportini', RIEPILOGO_ICON, suMappa && vistaMappa === 'riepilogo'),
          ];
        }
        return [
          renderLink(
            item.href,
            item.label,
            MODULE_ICONS[item.key as AppModuleKey],
            matchesPath(pathname, item.href, item.matchPrefixes),
            item.key === 'lista-attesa' ? badgeAttesa : undefined,
          ),
        ];
      });

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
          className={`flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition hover:bg-[var(--brand-surface-muted)] ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ color: 'var(--brand-primary)' }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary-soft)]">
            {DASHBOARD_HOME_ICON}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-bold tracking-[0.04em]">PLENZICH</span>
              <span className="truncate text-[9px] tracking-[0.12em] text-[var(--brand-text-subtle)]">DASHBOARD</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3 sidebar-scrollbar">
        {renderLink('/hub', 'Dashboard', DASHBOARD_HOME_ICON, homeActive)}

        {GROUP_ORDER.map((group, idx) => {
          const links = renderModuleLinks(group);
          const isSistema = group === 'sistema';
          if (links.length === 0 && !isSistema) return null;
          return (
            <div key={group} className="space-y-1">
              {collapsed ? (
                idx > 0 && <div className="mx-2 my-1 border-t" style={{ borderColor: 'var(--brand-border)' }} />
              ) : (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-subtle)]">
                  {groupLabels[group]}
                </p>
              )}
              {links}
              {isSistema && renderLink('/account/password', 'Account', ACCOUNT_ICON, accountActive)}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle (solo desktop) */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          title={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          className={`m-2 flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
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
