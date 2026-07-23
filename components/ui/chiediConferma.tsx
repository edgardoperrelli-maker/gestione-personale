'use client';

// Conferma imperativa promise-based sul primitivo ConfirmDialog (stile toast):
//   const ok = await chiediConferma({ title: 'Eliminare X?', danger: true });
// <ConfirmHost /> va montato UNA volta per albero (AppShell). Se l'host non è
// montato (es. portali non migrati), fallback al confirm nativo: mai bloccarsi.

import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

type Richiesta = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
};
type Pending = Richiesta & { resolve: (ok: boolean) => void };

let listener: ((p: Pending) => void) | null = null;

export function chiediConferma(r: Richiesta): Promise<boolean> {
  if (!listener) {
    return Promise.resolve(window.confirm(r.message ? `${r.title}\n${r.message}` : r.title));
  }
  return new Promise((resolve) => listener?.({ ...r, resolve }));
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    listener = setPending;
    return () => {
      listener = null;
    };
  }, []);

  if (!pending) return null;
  const chiudi = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmDialog
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel ?? 'Conferma'}
      danger={pending.danger}
      onConfirm={() => chiudi(true)}
      onClose={() => chiudi(false)}
    />
  );
}
