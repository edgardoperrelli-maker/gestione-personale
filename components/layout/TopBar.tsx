'use client';

import { useEffect, useState } from 'react';

type TopBarProps = {
  userName: string;
  roleLabel?: string;
  onLogout: () => void | Promise<void>;
  /** Apre il drawer della sidebar su mobile. */
  onOpenMobile: () => void;
};

export default function TopBar({ userName, roleLabel = 'Operatore', onLogout, onOpenMobile }: TopBarProps) {
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'));
  }, []);

  const toggleTheme = () => {
    setIsLight((current) => {
      const next = !current;
      document.documentElement.classList.toggle('light', next);
      try {
        localStorage.setItem('theme', next ? 'light' : 'dark');
      } catch {
        // localStorage non disponibile: ignora
      }
      return next;
    });
  };

  return (
    <header
      className="sticky top-0 z-30 border-b bg-[var(--brand-surface)]/95 shadow-sm backdrop-blur"
      style={{ borderColor: 'var(--brand-border)' }}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-4 md:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenMobile}
            aria-label="Apri menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-[var(--brand-primary-soft)] md:hidden"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <p className="hidden text-sm font-extrabold tracking-[0.12em] sm:block" style={{ color: 'var(--brand-primary)' }}>
            PLENZICH S.p.A.
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
            onClick={toggleTheme}
            aria-label="Cambia tema chiaro/scuro"
            title={isLight ? 'Passa al tema scuro' : 'Passa al tema chiaro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-[var(--brand-primary-soft)]"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            {isLight ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--brand-primary-soft)]"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            Esci
          </button>
        </div>
      </div>
    </header>
  );
}
