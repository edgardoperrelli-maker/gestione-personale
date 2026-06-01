'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { AppModuleKey } from '@/lib/moduleAccess';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

type Props = {
  children: ReactNode;
  roleLabel?: string;
  userName?: string;
  allowedModules?: AppModuleKey[];
  onLogout?: () => void | Promise<void>;
};

const COLLAPSE_KEY = 'sidebar:collapsed';

export default function AppShell({
  children,
  roleLabel = 'Operatore',
  userName,
  allowedModules,
  onLogout,
}: Props) {
  const displayName = userName ?? 'Utente';
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Ripristina la preferenza di collasso (stesso pattern del theme toggle)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // localStorage non disponibile: ignora
    }
  }, []);

  // Chiudi il drawer mobile quando cambia rotta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Chiudi il drawer con Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // ignora
      }
      return next;
    });
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen bg-[var(--brand-bg)]">
      {/* Sidebar desktop (in-flow) */}
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar
          allowedModules={allowedModules}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </div>

      {/* Sidebar mobile (drawer overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-[oklch(0_0_0/0.5)]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 h-full shadow-xl">
            <Sidebar
              allowedModules={allowedModules}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Colonna principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={displayName}
          roleLabel={roleLabel}
          onLogout={handleLogout}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1920px] px-3 py-6 sm:px-4 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
