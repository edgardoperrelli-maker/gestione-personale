/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { RefreshCw } from 'lucide-react';

/**
 * Pulsante flottante "Sincronizza e aggiorna" (due frecce che si rincorrono) per le pagine
 * operatore. Sta nella pila dei FAB, sopra la lente e il "+". Mostra il conteggio in coda
 * come badge. Al tap NON sincronizza in silenzio: apre la modale `ModaleSincronizza` che
 * mostra cosa sta inviando e offre "Aggiorna pagina".
 * `bottom` è passato come stringa (calc con safe-area) per impilarlo sopra gli altri FAB.
 *
 * Resta un `<button>` a mano e NON passa dal primitivo `Button`: è un cerchio a dimensione
 * fissa (48px, già il target di `size="touch"`) e il primitivo imporrebbe raggio `md` e
 * padding orizzontale. Ha comunque focus ring e ombra di livello 3 da token.
 */
export function FabSync({
  inAttesa,
  online,
  onApri,
  bottom,
}: {
  inAttesa: number;
  online: boolean;
  onApri: () => void;
  bottom: string;
}) {
  return (
    <button
      type="button"
      onClick={onApri}
      aria-label="Sincronizza e aggiorna"
      title={online ? 'Sincronizza e aggiorna la pagina' : 'Offline: i dati sono salvati. Apri per vedere la coda'}
      style={{ bottom }}
      /* 48px esatti: `h-12` (3rem) sul telefono rendeva 54px, perché il root è a 18px. */
      className="fixed right-3 z-20 flex h-[48px] w-[48px] items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] shadow-[var(--shadow-lg)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] active:scale-95"
    >
      <RefreshCw className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
      {inAttesa > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 font-mono text-[11px] font-semibold tabular-nums text-[var(--on-primary)]">
          {inAttesa}
        </span>
      )}
    </button>
  );
}