'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import CampanelloRichieste from './CampanelloRichieste';
import NovitaCenter from './NovitaCenter';

type TopBarProps = {
  userName: string;
  roleLabel?: string;
  isAdmin?: boolean;
  onLogout: () => void | Promise<void>;
  /** Apre il drawer della sidebar su mobile. */
  onOpenMobile: () => void;
  /** Apre la command palette (⌘K). */
  onOpenPalette?: () => void;
};

function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return '?';
  if (parti.length === 1) return parti[0].slice(0, 2).toUpperCase();
  return (parti[0][0] + parti[parti.length - 1][0]).toUpperCase();
}

export default function TopBar({ userName, roleLabel = 'Operatore', isAdmin = false, onLogout, onOpenMobile, onOpenPalette }: TopBarProps) {
  const [isLight, setIsLight] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'));
  }, []);

  // Chiusura user menu su click esterno + Esc (stesso pattern di MultiSelect).
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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

  const menuItemClasses =
    'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm font-medium text-[var(--brand-text-main)] transition-colors hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]';

  return (
    <header
      className="sticky top-0 z-40 border-b bg-[var(--brand-surface)]/95 backdrop-blur"
      style={{ borderColor: 'var(--brand-border)' }}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-4 md:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenMobile}
            aria-label="Apri menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] md:hidden"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          {/* Wordmark solo dove la sidebar (che porta già il brand) non c'è: mobile. */}
          <p className="text-sm font-bold tracking-[0.06em] md:hidden" style={{ color: 'var(--brand-primary)' }}>
            PLENZICH
          </p>
        </div>

        {onOpenPalette && (
          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden max-w-sm flex-1 items-center gap-2.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3.5 py-1.5 text-sm text-[var(--brand-text-subtle)] transition hover:border-[var(--brand-primary-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] sm:flex"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-left">Cerca moduli e viste</span>
            <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--brand-text-muted)]">
              ⌘K
            </kbd>
          </button>
        )}

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <NovitaCenter />
          {isAdmin && <CampanelloRichieste />}

          {/* User menu: avatar → nome, ruolo, tema, logout */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Menu utente — ${userName}`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-xs font-semibold text-[var(--primary-text)] transition hover:bg-[var(--brand-primary-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              {iniziali(userName)}
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  aria-label="Menu utente"
                  initial={{ opacity: 0, y: reduced ? 0 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 top-full z-50 mt-2 w-60 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1 shadow-[var(--shadow-md)]"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-[var(--brand-text-main)]" title={userName}>
                      {userName}
                    </p>
                    <p className="text-xs text-[var(--brand-text-muted)]">{roleLabel}</p>
                  </div>
                  <div className="mx-1 my-1 border-t border-[var(--brand-border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      toggleTheme();
                      setMenuOpen(false);
                    }}
                    className={menuItemClasses}
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
                    {isLight ? 'Tema scuro' : 'Tema chiaro'}
                  </button>
                  <div className="mx-1 my-1 border-t border-[var(--brand-border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void onLogout()}
                    className={`${menuItemClasses} text-[var(--danger)] hover:bg-[var(--danger-soft)]`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Esci
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
