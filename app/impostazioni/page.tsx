'use client';
import Link from 'next/link';

const MODULES = [
  {
    href: '/impostazioni/utenze',
    title: 'Utenze',
    description: 'Gestisci password, ruoli e moduli visibili per ogni utente di accesso.',
    icon: 'U',
  },
  {
    href: '/impostazioni/personale',
    title: 'Personale',
    description: 'Definisci validita e indirizzo di partenza degli operatori del cronoprogramma.',
    icon: 'P',
  },
  {
    href: '/impostazioni/zone-ztl',
    title: 'Zone ZTL',
    description: 'Definisci zone a traffico limitato, CAP e operatori autorizzati.',
    icon: 'Z',
  },
  {
    href: '/impostazioni/codici-allegato10',
    title: 'Codici Allegato 10',
    description: 'Seleziona i codici servizio per i quali viene generato automaticamente il verbale Word.',
    icon: 'W',
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary-soft)] text-2xl font-bold text-[var(--brand-primary)]">
              {module.icon}
            </div>
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
