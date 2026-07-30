import * as React from 'react';
import { cn } from '@/lib/utils';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean };

/**
 * Select del sistema: larghezza piena di default, sovrascrivibile dal chiamante.
 *
 * Le classi passano da `cn` (tailwind-merge) e non da una concatenazione di stringhe. In Tailwind v4
 * dentro lo stesso gruppo di utility vince l'ordine di emissione nel foglio di stile, non l'ordine
 * nell'attributo `class`: con la concatenazione un `w-36` passato dal chiamante finiva *dopo*
 * `w-full` nell'attributo ma *prima* nel CSS, e la larghezza richiesta non veniva mai disegnata —
 * ogni Select restava a tutta riga. È la stessa trappola documentata in DESIGN.md §8 per
 * `grid-cols`. `cn` la chiude a monte: risolve il conflitto togliendo `w-full` dalla stringa quando
 * il chiamante porta la propria larghezza, invece di sperare nell'ordine di emissione.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, error = false, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={error || undefined}
    className={cn(
      'w-full rounded-[var(--radius-md)] border bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-[var(--brand-surface-muted)] disabled:opacity-60',
      error
        ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
        : 'border-[var(--brand-border)] hover:border-[var(--brand-border-strong)] focus:border-[var(--brand-primary)] focus:ring-[var(--brand-primary)]',
      className,
    )}
    {...props}
  />
));

Select.displayName = 'Select';

export default Select;
