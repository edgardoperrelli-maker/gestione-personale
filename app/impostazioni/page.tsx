'use client';
import Link from 'next/link';

const MODULES = [
  {
    href: '/impostazioni/utenze',
    title: 'Utenze',
    description: 'Gestisci password, ruoli e moduli visibili per ogni utente di accesso.',
    icon: '👤',
  },
  {
    href: '/impostazioni/zone-ztl',
    title: 'Zone ZTL',
    description: 'Definisci zone a traffico limitato, CAP e operatori autorizzati.',
    icon: '🚫',
  },
];

export default function ImpostazioniPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Impostazioni</h1>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Gestisci la configurazione dell&apos;app e gli accessi agli utenti
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-4 text-3xl">{module.icon}</div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--brand-text-main)]">{module.title}</h2>
            <p className="mb-4 text-sm text-[var(--brand-text-muted)]">{module.description}</p>
            <div className="flex items-center text-sm font-semibold text-[var(--brand-primary)]">
              Gestisci
              <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
