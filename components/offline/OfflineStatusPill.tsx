'use client';

import { useStatoSync } from '@/lib/offline/useStatoSync';

/**
 * Striscia di STATO sincronizzazione per le pagine operatore (sola lettura):
 * offline / in attesa / tutto sincronizzato / da risolvere.
 * L'azione "Sincronizza" è nel FAB flottante (FabSync), sopra la lente e il "+".
 */
export function OfflineStatusPill({ token }: { token: string }) {
  const { inAttesa, bloccati, online } = useStatoSync(token);

  let testo: string;
  let cls: string;
  if (bloccati > 0) {
    testo = `${bloccati} da risolvere`;
    cls = 'bg-[var(--danger-soft)] text-[var(--danger)]';
  } else if (inAttesa > 0) {
    testo = online ? `Sincronizzazione… (${inAttesa})` : `Offline · ${inAttesa} in attesa`;
    cls = 'bg-[var(--warning-soft,#fef3c7)] text-[var(--warning-fg,#92400e)]';
  } else {
    testo = online ? 'Tutto sincronizzato' : 'Offline';
    cls = online ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]';
  }

  return (
    <div className="mx-auto flex max-w-[480px] items-center justify-center px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
        {testo}
      </span>
    </div>
  );
}
