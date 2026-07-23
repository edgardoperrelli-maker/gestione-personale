'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Descrizione al passaggio del mouse per i comandi a sola icona.
 *
 * Sostituisce il `title` nativo, che aveva tre difetti: compariva dopo circa un
 * secondo, non compariva mai col focus da tastiera, e — messo accanto a un
 * `aria-label` con lo stesso testo — faceva annunciare il nome due volte ai
 * lettori di schermo.
 *
 * Qui il nome accessibile resta UNO SOLO: l'`aria-label` sul trigger. La
 * bollicina è `aria-hidden`, cioè puramente visiva, quindi non si somma
 * all'annuncio. Ritardo 800ms col mouse (in una griglia di comandi vicini,
 * senza ritardo si lascerebbe una scia di bollicine) e 0ms col focus, dove
 * l'intenzione è già dichiarata.
 */
export default function Tooltip({
  testo,
  children,
  posizione = 'sopra',
}: {
  testo: string;
  children: ReactNode;
  posizione?: 'sopra' | 'sotto';
}) {
  const [aperto, setAperto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const annulla = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => annulla, []);

  const apriConRitardo = () => {
    annulla();
    timer.current = setTimeout(() => setAperto(true), 800);
  };
  const apriSubito = () => {
    annulla();
    setAperto(true);
  };
  const chiudi = () => {
    annulla();
    setAperto(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={apriConRitardo}
      onMouseLeave={chiudi}
      // `onFocus`/`onBlur` e non le varianti Capture: React li implementa con
      // focusin/focusout, che risalgono, quindi il contenitore vede il focus del
      // bottone che avvolge.
      onFocus={apriSubito}
      onBlur={chiudi}
      onKeyDown={(e) => { if (e.key === 'Escape') chiudi(); }}
    >
      {children}
      {aperto && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 z-[70] w-max max-w-[220px] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs font-medium text-[var(--brand-text-main)] shadow-[var(--shadow-md)] ${
            posizione === 'sopra' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {testo}
        </span>
      )}
    </span>
  );
}
