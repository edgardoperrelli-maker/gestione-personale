// Card "foglietta": voce di landing di un modulo che porta a una vista dedicata
// (pattern IA della spec premium: viste di modulo = fogliette + route + breadcrumb;
// le tab restano solo come filtri di dato in pagina). Unifica le landing di
// Performance / Impostazioni / Consuntivazione.

import Link from 'next/link';
import * as React from 'react';

type FogliettaCardProps = {
  href: string;
  title: string;
  description?: string;
  /** Icona del modulo (es. da MODULE_ICONS), resa in un riquadro accentato. */
  icon?: React.ReactNode;
  /** Conteggio opzionale a destra (es. elementi in coda). */
  count?: number | string;
  className?: string;
};

export default function FogliettaCard({
  href,
  title,
  description,
  icon,
  count,
  className = '',
}: FogliettaCardProps) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--brand-primary-border)] hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] motion-reduce:hover:translate-y-0 ${className}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--brand-text-main)]">{title}</span>
        {description && (
          <span className="block truncate text-xs text-[var(--brand-text-muted)]">{description}</span>
        )}
      </span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[var(--brand-text-muted)]">
          {count}
        </span>
      )}
      <span
        aria-hidden="true"
        className="shrink-0 text-[var(--primary-text)] transition-transform group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
      >
        →
      </span>
    </Link>
  );
}
