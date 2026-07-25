/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { Plus } from 'lucide-react';

export function FabInterventoManuale({ abilitato, onClick }: { abilitato: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!abilitato}
      aria-label="Aggiungi intervento manuale"
      /* 48px ESATTI, non `h-12`: sul telefono il root è 18px, quindi `h-12` (3rem) rendeva
         54px — 6 in più del target, su un cerchio che galleggia sopra i dati. I px assoluti
         tengono il bersaglio al minimo WCAG senza seguire l'ingrandimento del root. */
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-20 flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[var(--brand-primary)] text-[var(--on-primary)] shadow-[var(--shadow-md)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-bg)] enabled:hover:bg-[var(--brand-primary-hover)] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus aria-hidden className="h-[22px] w-[22px]" strokeWidth={2} />
    </button>
  );
}