'use client';

import * as React from 'react';

/**
 * Barra filtri componibile (sistema Cockpit): campo di ricerca libero + pill
 * rimovibili con ✕ + bottone tratteggiato «+ Filtro». La barra è presentazione
 * pura: lo stato dei filtri resta nelle pagine.
 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 shadow-[var(--shadow-sm)]">
      {children}
    </div>
  );
}

/** Pill di filtro attivo, rimovibile. */
export function FilterPill({ children, onRemove, removeLabel }: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] py-1 pl-3 pr-1 text-xs font-semibold text-[var(--primary-text)]">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? 'Rimuovi filtro'}
        className="rounded-full px-1.5 py-0.5 opacity-60 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        ✕
      </button>
    </span>
  );
}

/** Bottone tratteggiato «+ Filtro». */
export function AddFilterButton({ children = '+ Filtro', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border border-dashed border-[var(--brand-border-strong)] px-3.5 py-1 text-xs font-semibold text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}
