'use client';

import { useState } from 'react';
import { useStatoSync } from '@/lib/offline/useStatoSync';

/**
 * Striscia di stato sincronizzazione per le pagine operatore.
 * Stato a sinistra (offline/in attesa/sincronizzato/da risolvere) + pulsante 🔄
 * sempre visibile a destra: forza la sincronizzazione e gira durante l'invio.
 */
export function OfflineStatusPill({ token }: { token: string }) {
  const { inAttesa, bloccati, online, sincronizzaOra } = useStatoSync(token);
  const [girando, setGirando] = useState(false);

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

  const onSync = async () => {
    if (girando) return;
    setGirando(true);
    try {
      await sincronizzaOra();
    } finally {
      setGirando(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2 px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
        {testo}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={girando}
        aria-label="Sincronizza ora"
        title={online ? 'Sincronizza ora' : 'Offline: i dati sono salvati, partiranno alla connessione'}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--brand-border)] px-3 py-1 text-xs font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        Sincronizza
      </button>
    </div>
  );
}
