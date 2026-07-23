import Link from 'next/link';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { assertKpiAccess } from '@/lib/performance/kpiGate';

export const dynamic = 'force-dynamic';

// Foglietta grande (pattern «pagina intera per contenuto ridotto», come Consuntivazione).
const cardClass =
  'group flex min-h-56 flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-7 text-left shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] motion-reduce:hover:translate-y-0 sm:p-8';

const ICONA_OPERATORI = (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ICONA_ECONOMICA = (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </svg>
);

export default async function KpiLandingPage() {
  await assertKpiAccess();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <ObjectHeader title="KPI" sub="Scegli la vista." />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Link href="/hub/performance/operatori" className={cardClass}>
          <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]">
            {ICONA_OPERATORI}
          </span>
          <span className="text-lg font-semibold text-[var(--brand-text-main)]">Performance operatori</span>
          <span className="max-w-[52ch] text-sm leading-relaxed text-[var(--brand-text-muted)]">
            Interventi completati per operatore: produzione giornaliera, confronto, distribuzioni e dettaglio.
          </span>
          <span className="mt-auto text-sm font-semibold text-[var(--primary-text)] transition group-hover:translate-x-0.5 motion-reduce:transition-none">
            Apri →
          </span>
        </Link>
        <Link href="/hub/performance/economica" className={cardClass}>
          <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]">
            {ICONA_ECONOMICA}
          </span>
          <span className="text-lg font-semibold text-[var(--brand-text-main)]">Produzione economica</span>
          <span className="max-w-[52ch] text-sm leading-relaxed text-[var(--brand-text-muted)]">
            Valorizzazione € (Produzione vs SAL), listino tariffe, audit a tre vie ed export Excel.
          </span>
          <span className="mt-auto text-sm font-semibold text-[var(--primary-text)] transition group-hover:translate-x-0.5 motion-reduce:transition-none">
            Apri →
          </span>
        </Link>
      </div>
    </div>
  );
}
