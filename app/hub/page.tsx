import Link from 'next/link';

const modules = [
  {
    href: '/dashboard',
    title: 'Cronoprogramma',
    description: 'Pianifica turni, assegnazioni e reperibilita.',
    badge: 'Core',
    badgeStyle: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 12h7v9H3z" />
        <path d="M14 3h7v18h-7z" />
      </svg>
    ),
  },
  {
    href: '/hub/hotel-calendar',
    title: 'Calendario Hotel',
    description: 'Prenotazioni, occupazione e flussi.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    href: '/hub/smartracker',
    title: 'SmarTracker',
    description: 'Monitoraggio operativo e tracciamento.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12a8 8 0 1 0 16 0" />
        <path d="M12 4v8l4 2" />
      </svg>
    ),
  },
  {
    href: '/hub/rapportini',
    title: 'Rapportini',
    description: 'Massivi e per clientela con export.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M15 2v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    href: '/hub/attrezzature',
    title: 'Attrezzature',
    description: 'Scadenziario con alert e controlli.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 7h16" />
        <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
        <path d="M9 7V4h6v3" />
      </svg>
    ),
  },
  {
    href: '/hub/mappa',
    title: 'Mappa Operatori',
    description: 'Distribuzione territoriale in tempo reale.',
    badge: 'Nuovo',
    badgeStyle: 'bg-green-100 text-green-700',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
];

export default function HubPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Hub Moduli</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Accedi rapidamente ai moduli operativi di Gestione Personale.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
                {module.icon}
              </div>
              {module.badge && (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${module.badgeStyle}`}>
                  {module.badge}
                </span>
              )}
            </div>

            <div className="mt-4">
              <h2 className="text-lg font-semibold">{module.title}</h2>
              <p className="mt-1 text-sm text-[var(--brand-text-muted)]">{module.description}</p>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)]">
              <span>Apri</span>
              <span className="transition-transform group-hover:translate-x-1">-&gt;</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
