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
    <header className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="truncate text-[15px] font-bold text-[var(--brand-text-main)]">{staffName}</h1>
        <span className="shrink-0 text-xs text-[var(--brand-text-muted)]">{dataLabel}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--success)]">✓ {eseguiti}</span>
        <span className="inline-flex items-center rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--danger)]">✗ {nonEseguiti}</span>
        <span className="inline-flex items-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-text-subtle)]">{daFare} da fare</span>
        <span className="ml-auto text-[11px] font-semibold tabular-nums text-[var(--brand-text-subtle)]">{completati}/{totali}</span>
      </div>

      {lavorazioni.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {lavorazioni.map((l) => (
            <span key={l.chiave} className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-text-muted)]">
              {l.etichetta} <b className="text-[var(--brand-primary)]">{l.count}</b>
            </span>
          ))}
        </div>
      )}

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--brand-surface-muted)]">
        <div className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
