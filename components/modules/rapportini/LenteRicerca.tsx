/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

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
        /* 48px esatti: `h-12` (3rem) sul telefono rendeva 54px, root a 18px. */
        className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-3 z-20 flex h-[48px] w-[48px] items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] shadow-[var(--shadow-md)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-bg)] active:scale-95"
      >
        <Search aria-hidden className="h-[22px] w-[22px]" strokeWidth={2} />
      </button>
    );
  }

  return (
    // Bordo 1px + ring al focus-within (il campo dentro non disegna il proprio): la pillola
    // INTERA è il campo di ricerca, quindi il fuoco si vede sul suo bordo, una volta sola.
    <div className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-3 z-20 flex h-[48px] max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border border-[var(--brand-primary)] bg-[var(--brand-surface)] pl-0.5 pr-1 shadow-[var(--shadow-md)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]">
      <button
        type="button"
        onClick={chiudi}
        aria-label="Chiudi ricerca"
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[var(--brand-text-muted)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] active:bg-[var(--brand-surface-muted)]"
      >
        <X aria-hidden className="h-5 w-5" strokeWidth={2} />
      </button>
      <input
        autoFocus
        type="text"
        inputMode="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Via, ODS/ODL o matricola"
        aria-label="Cerca"
        // `input {…}` in globals.css sta fuori dai @layer: batte le utility Tailwind, quindi
        // fondo/bordo/ring del campo si spengono solo da qui (memoria: utility inerti).
        style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
        className="w-40 min-w-0 text-base text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:outline-none"
      />
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--primary-text)]">
        <Search className="h-5 w-5" strokeWidth={2} />
      </span>
    </div>
  );
}