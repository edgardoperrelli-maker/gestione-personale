import Link from 'next/link';

/** Navigazione tra le due sotto-pagine del modulo Lista attesa.
 *  Usa uno stile underline-tab (come Tabs primitive) mantenendo next/link per prefetch/routing.
 */
export function ListaAttesaNav({ attivo }: { attivo: 'richieste' | 'registro' }) {
  return (
    <nav className="flex items-end gap-0 border-b border-[var(--brand-border)]">
      <Link
        href="/hub/lista-attesa"
        className={[
          'px-4 pb-2.5 text-xl font-semibold tracking-tight transition-colors',
          attivo === 'richieste'
            ? 'border-b-2 border-[var(--brand-primary)] text-[var(--brand-text-main)]'
            : 'border-b-2 border-transparent text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]',
        ].join(' ')}
      >
        Richieste manuali
      </Link>
      <Link
        href="/hub/lista-attesa/registro"
        className={[
          'px-4 pb-2.5 text-xl font-semibold tracking-tight transition-colors',
          attivo === 'registro'
            ? 'border-b-2 border-[var(--brand-primary)] text-[var(--brand-text-main)]'
            : 'border-b-2 border-transparent text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]',
        ].join(' ')}
      >
        Registro autorizzazioni
      </Link>
    </nav>
  );
}
