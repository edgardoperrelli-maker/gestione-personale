'use client';

import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';

/** Campanello admin: badge realtime col numero di richieste manuali in attesa; apre la torre. */
export default function CampanelloRichieste() {
  const { count, live } = useRichiesteManualiFeed();

  return (
    <a
      href="/hub/torre"
      aria-label={`Richieste manuali in attesa: ${count}`}
      title={live ? `${count} richieste in attesa` : `${count} richieste in attesa (offline)`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-[var(--brand-primary-soft)]"
      style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white"
          style={{ backgroundColor: 'var(--danger)' }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </a>
  );
}
