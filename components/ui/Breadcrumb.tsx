// Breadcrumb condiviso per il rientro dalle fogliette (viste di modulo).
// L'ultima voce è la pagina corrente (aria-current, senza link).

import Link from 'next/link';

export type BreadcrumbItem = { label: string; href?: string };

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export default function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Percorso" className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-[var(--brand-text-subtle)]">
                  /
                </span>
              )}
              {last || !item.href ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={last ? 'font-semibold text-[var(--brand-text-main)]' : 'text-[var(--brand-text-muted)]'}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="rounded-[var(--radius-sm)] text-[var(--brand-text-muted)] transition-colors hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
