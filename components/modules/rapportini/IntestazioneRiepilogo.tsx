'use client';

import type { RiepilogoRapportino } from '@/utils/rapportini/riepilogo';

export function IntestazioneRiepilogo({
  staffName,
  dataLabel,
  riepilogo,
}: {
  staffName: string;
  dataLabel: string;
  riepilogo: RiepilogoRapportino;
}) {
  const { eseguiti, nonEseguiti, daFare, totali, lavorazioni } = riepilogo;
  const completati = eseguiti + nonEseguiti;
  const pct = totali > 0 ? Math.round((completati / totali) * 100) : 0;
  return (
    <header className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Rapportino</p>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold text-[var(--brand-text-main)]">{staffName}</h1>
        <span className="shrink-0 text-sm text-[var(--brand-text-muted)]">{dataLabel}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-bold text-[var(--success)]">✓ {eseguiti} eseguiti</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-bold text-[var(--danger)]">✗ {nonEseguiti} non eseguiti</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2.5 py-1 text-xs font-bold text-[var(--brand-text-subtle)]">{daFare} da fare</span>
      </div>

      {lavorazioni.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lavorazioni.map((l) => (
            <span key={l.chiave} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--brand-text-muted)]">
              {l.etichetta} <b className="text-[var(--brand-primary)]">{l.count}</b>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]">
        <div className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
