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

/*
  Tutta la barra dei filtri sta a 30px, come un `Button size="sm"` — che le sta accanto (su
  Interventi la riga finisce con «Esporta Excel»). Ci si arriva con due padding diversi, e non
  e' una svista: il `py` da solo non decide l'altezza, decide il contenuto piu' alto.

  · `FilterPill` resta a `py-1`: dentro ha il bottone ✕, che con il suo `py-0.5` misura 20px e
    comanda lui — 8 + 20 + 2 di bordo = 30. Portarla a `py-1.5` la fa 34 (provato).
  · `AddFilterButton` va a `py-1.5`: non ha il ✕, quindi comanda il testo — 12 + 16 + 2 = 30.
    Con `py-1` erano 26.
*/

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
      className={`rounded-full border border-dashed border-[var(--brand-border-strong)] px-3.5 py-1.5 text-xs font-semibold text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}
