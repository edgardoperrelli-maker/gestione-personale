'use client';

import { useState } from 'react';

/** Lente compatta in basso a destra (sopra il "+"); al tap si espande verso sinistra in un campo di ricerca. */
export function LenteRicerca({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [aperto, setAperto] = useState(false);
  const chiudi = () => { onChange(''); setAperto(false); };

  if (!aperto) {
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        aria-label="Cerca tra i tuoi ordini"
        className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-3 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] shadow-lg transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-3 z-20 flex h-12 max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border-2 border-[var(--brand-primary)] bg-[var(--brand-surface)] py-1 pl-1 pr-1 shadow-lg">
      <button type="button" onClick={chiudi} aria-label="Chiudi ricerca" className="flex h-10 w-10 min-h-0 shrink-0 items-center justify-center rounded-full text-[var(--brand-text-muted)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <input
        autoFocus
        type="text"
        inputMode="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Via, ODS/ODL o matricola"
        aria-label="Cerca"
        className="w-40 min-w-0 bg-transparent text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:outline-none"
      />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      </span>
    </div>
  );
}
