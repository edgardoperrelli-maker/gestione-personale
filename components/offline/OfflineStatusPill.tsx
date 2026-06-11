'use client';

import { useStatoSync } from '@/lib/offline/useStatoSync';

/**
 * Pillola di stato sincronizzazione per le pagine operatore.
 * Offline/in attesa → conteggio; tutto sincronizzato → conferma; bloccati → avviso.
 * Mostra "Sincronizza ora" quando c'è qualcosa in coda ed è online.
 */
export function OfflineStatusPill({ token }: { token: string }) {
  const { inAttesa, bloccati, online, sincronizzaOra } = useStatoSync(token);

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
    <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2 px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
        {testo}
      </span>
      {inAttesa > 0 && online && (
        <button
          type="button"
          onClick={sincronizzaOra}
          className="rounded-full border border-[var(--brand-border)] px-3 py-1 text-xs font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)]"
        >
          Sincronizza ora
        </button>
      )}
    </div>
  );
}
