'use client';

import type { ReactNode } from 'react';
import type { AppModuleKey } from '@/lib/moduleAccess';
import TopNav from './TopNav';

type Props = {
  children: ReactNode;
  roleLabel?: string;
  userName?: string;
  allowedModules?: AppModuleKey[];
  onLogout?: () => void | Promise<void>;
};

export default function AppShell({
  children,
  roleLabel = 'Operatore',
  userName,
  allowedModules,
  onLogout,
}: Props) {
  const displayName = userName ?? 'Utente';

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }

    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-[var(--brand-bg)]">
      <TopNav
        userName={displayName}
        roleLabel={roleLabel}
        allowedModules={allowedModules}
        onLogout={handleLogout}
      />
      <main className="mx-auto w-full max-w-[1920px] px-3 py-6 sm:px-4 md:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
