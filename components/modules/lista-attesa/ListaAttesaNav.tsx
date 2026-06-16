import Link from 'next/link';

/** Navigazione tra le due sotto-pagine del modulo Lista attesa. */
export function ListaAttesaNav({ attivo }: { attivo: 'richieste' | 'registro' }) {
  const base = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition';
  const on = 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]';
  const off = 'border border-[var(--brand-border)] text-[var(--brand-text-muted)]';
  return (
    <nav className="flex flex-wrap gap-2">
      <Link href="/hub/lista-attesa" className={`${base} ${attivo === 'richieste' ? on : off}`}>
        Richieste manuali
      </Link>
      <Link href="/hub/lista-attesa/registro" className={`${base} ${attivo === 'registro' ? on : off}`}>
        Registro autorizzazioni
      </Link>
    </nav>
  );
}
