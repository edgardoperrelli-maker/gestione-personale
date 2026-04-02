import Link from 'next/link';
import AuthGate from '@/components/AuthGate';

export const dynamic = 'force-dynamic';

const MODULES = [
  {
    href: '/hub/rapportini/massiva',
    label: 'Rapportino Massiva',
    description: 'Genera rapportini per più operatori in un\'unica operazione. Import Excel, export PDF e ZIP.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5" />
        <path d="M9 12h6M9 16h4" />
        <path d="M17 18l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/hub/rapportini/clientela',
    label: 'Rapportino Clientela',
    description: 'Schermata e logica identica al file VBA. Filtra per operatore e genera PDF.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function RapportiniHubPage() {
  return (
    <AuthGate>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-text-main)' }}>
            Generazione Rapportini
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Seleziona il tipo di rapportino da generare.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="group relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md"
              style={{ borderColor: 'var(--brand-border)' }}
            >
              {/* Banda superiore colorata */}
              <div
                className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl transition group-hover:h-1.5"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              />

              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border transition group-hover:border-[var(--brand-primary)] group-hover:bg-[var(--brand-primary-soft)]"
                style={{
                  borderColor: 'var(--brand-border)',
                  color: 'var(--brand-primary)',
                  backgroundColor: 'var(--brand-primary-soft)',
                }}
              >
                {mod.icon}
              </div>

              <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                {mod.label}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--brand-text-muted)' }}>
                {mod.description}
              </p>

              <div
                className="mt-4 flex items-center gap-1 text-xs font-semibold transition group-hover:gap-2"
                style={{ color: 'var(--brand-primary)' }}
              >
                Apri
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AuthGate>
  );
}
