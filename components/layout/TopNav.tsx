'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { appNavigation } from '@/lib/appNavigation';
import type { AppModuleKey } from '@/lib/moduleAccess';

type TopNavProps = {
  userName: string;
  roleLabel?: string;
  allowedModules?: AppModuleKey[];
  onLogout: () => void | Promise<void>;
};

type MenuItem = {
  href: string;
  label: string;
  active: boolean;
};

function matchesPath(pathname: string, href: string, matchPrefixes?: string[]): boolean {
  const prefixes = matchPrefixes?.length ? matchPrefixes : [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function TopNav({
  userName,
  roleLabel = 'Operatore',
  allowedModules,
  onLogout,
}: TopNavProps) {
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!dropdownOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const visibleItems = appNavigation.filter((item) => {
    if (item.key === 'hub') return false;
    return !allowedModules || allowedModules.includes(item.key as AppModuleKey);
  });

  const moduleItems: MenuItem[] = visibleItems
    .filter((item) => item.section === 'modules')
    .map((item) => ({
      href: item.href,
      label: item.label,
      active: matchesPath(pathname, item.href, item.matchPrefixes),
    }));

  const systemItems: MenuItem[] = visibleItems
    .filter((item) => item.section === 'system')
    .map((item) => ({
      href: item.href,
      label: item.label,
      active: matchesPath(pathname, item.href, item.matchPrefixes),
    }));

  const accountItem: MenuItem = {
    href: '/account/password',
    label: 'Account',
    active: pathname === '/account/password' || pathname.startsWith('/account/'),
  };

  const showSystemDivider = moduleItems.length > 0 && (systemItems.length > 0 || accountItem.href.length > 0);

  return (
    <nav
      className="sticky top-0 z-40 border-b bg-[var(--brand-surface)]/95 shadow-sm backdrop-blur"
      style={{ borderColor: 'var(--brand-border)' }}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-[1920px] items-center justify-between gap-3 px-3 py-2 sm:px-4 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/hub"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:bg-[var(--brand-primary-soft)]"
            style={{ color: 'var(--brand-primary)' }}
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
              aria-hidden="true"
            >
              <path d="M15 18 9 12l6-6" />
            </svg>
            Hub
          </Link>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              onClick={() => setDropdownOpen((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--brand-primary-soft)]"
              style={{ color: 'var(--brand-text-main)' }}
            >
              Moduli
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={dropdownOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div
                className="absolute left-0 top-full mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border bg-white py-2 shadow-lg"
                style={{ borderColor: 'var(--brand-border)' }}
              >
                {moduleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDropdownOpen(false);
                    }}
                    className={`block px-4 py-2 text-sm transition hover:bg-[var(--brand-primary-soft)] ${
                      item.active ? 'font-semibold' : ''
                    }`}
                    style={{ color: item.active ? 'var(--brand-primary)' : 'var(--brand-text-main)' }}
                  >
                    {item.label}
                  </Link>
                ))}

                {showSystemDivider && (
                  <div className="my-1 border-t" style={{ borderColor: 'var(--brand-border)' }} />
                )}

                {systemItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDropdownOpen(false);
                    }}
                    className={`block px-4 py-2 text-sm transition hover:bg-[var(--brand-primary-soft)] ${
                      item.active ? 'font-semibold' : ''
                    }`}
                    style={{ color: item.active ? 'var(--brand-primary)' : 'var(--brand-text-main)' }}
                  >
                    {item.label}
                  </Link>
                ))}

                <Link
                  href={accountItem.href}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDropdownOpen(false);
                  }}
                  className={`block px-4 py-2 text-sm transition hover:bg-[var(--brand-primary-soft)] ${
                    accountItem.active ? 'font-semibold' : ''
                  }`}
                  style={{ color: accountItem.active ? 'var(--brand-primary)' : 'var(--brand-text-main)' }}
                >
                  {accountItem.label}
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="hidden select-none text-center md:block">
          <p
            className="text-sm font-extrabold tracking-[0.12em]"
            style={{ color: 'var(--brand-primary)' }}
          >
            PLENZICH S.p.A.
          </p>
          <p
            className="text-[9px] tracking-[0.3em]"
            style={{ color: 'var(--brand-text-muted)' }}
          >
            GESTIONE PERSONALE
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span
            className="hidden rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-1 text-xs font-semibold md:inline-flex"
            style={{ color: 'var(--brand-primary)' }}
          >
            {roleLabel}
          </span>
          <span
            className="hidden max-w-[180px] truncate text-sm font-medium sm:block"
            style={{ color: 'var(--brand-text-main)' }}
            title={userName}
          >
            {userName}
          </span>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--brand-primary-soft)]"
            style={{
              borderColor: 'var(--brand-border)',
              color: 'var(--brand-text-main)',
            }}
          >
            Esci
          </button>
        </div>
      </div>
    </nav>
  );
}
