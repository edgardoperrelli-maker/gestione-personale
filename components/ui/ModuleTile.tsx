import Link from 'next/link';
import * as React from 'react';

const CARD =
  'group relative flex items-start gap-3.5 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-[var(--shadow-md)] motion-reduce:hover:translate-y-0';

/**
 * Tile della griglia-launcher: la voce che porta a un MODULO (hub e Impostazioni),
 * non a una vista di un modulo (per quello vedi FogliettaCard, §7bis).
 *
 * Due modi, per coprire entrambi i consumatori senza cambiarne il comportamento:
 * - senza `action` → l'intera card è un `<Link>` (Impostazioni);
 * - con `action` (es. la stella dei preferiti) → la card è un `<div>` con
 *   link-overlay (`after:inset-0`), così l'azione resta cliccabile sopra il link.
 */
export default function ModuleTile({
  href,
  title,
  description,
  icon,
  action,
  descriptionLines = 1,
  titleClassName = '',
}: {
  href: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Slot in alto a destra (es. stella preferiti). Se presente, card = div + link-overlay. */
  action?: React.ReactNode;
  /** Righe descrizione: 1 = troncata (default), 2 = line-clamp-2. */
  descriptionLines?: 1 | 2;
  titleClassName?: string;
}) {
  const iconEl = icon ? (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]"
    >
      {icon}
    </span>
  ) : null;

  const descEl = description ? (
    <span
      className={`mt-0.5 block text-xs text-[var(--brand-text-muted)] ${
        descriptionLines === 2 ? 'line-clamp-2 leading-snug' : 'truncate'
      }`}
    >
      {description}
    </span>
  ) : null;

  // Con azione: contenitore + link-overlay, così l'azione (z-10) resta cliccabile.
  if (action) {
    return (
      <div className={`${CARD} focus-within:ring-2 focus-within:ring-[var(--brand-primary)]`}>
        {iconEl}
        <span className="min-w-0 pr-7">
          <Link
            href={href}
            className={`font-semibold text-[var(--brand-text-main)] focus:outline-none after:absolute after:inset-0 after:content-[''] ${titleClassName}`}
          >
            {title}
          </Link>
          {descEl}
        </span>
        {action}
      </div>
    );
  }

  // Senza azione: l'intera card è il link.
  return (
    <Link
      href={href}
      className={`${CARD} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]`}
    >
      {iconEl}
      <span className="min-w-0">
        <span className={`block font-semibold text-[var(--brand-text-main)] ${titleClassName}`}>{title}</span>
        {descEl}
      </span>
    </Link>
  );
}
