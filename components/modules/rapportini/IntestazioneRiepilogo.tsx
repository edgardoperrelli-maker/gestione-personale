'use client';

import { Check, X } from 'lucide-react';
import type { RiepilogoRapportino } from '@/utils/rapportini/riepilogo';

export function IntestazioneRiepilogo({
  staffName,
  dataLabel,
  riepilogo,
  mostraSaracinesche = false,
}: {
  staffName: string;
  dataLabel: string;
  riepilogo: RiepilogoRapportino;
  /** Mostra il riepilogo "Saracinesche esitate" (template ACEA/limitazioni con campo valvola). */
  mostraSaracinesche?: boolean;
}) {
  const { eseguiti, nonEseguiti, daFare, totali, saracinesche, lavorazioni } = riepilogo;
  const completati = eseguiti + nonEseguiti;
  const pct = totali > 0 ? Math.round((completati / totali) * 100) : 0;
  return (
    <header className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="truncate text-[15px] font-semibold text-[var(--brand-text-main)]">{staffName}</h1>
        <span className="shrink-0 text-xs text-[var(--brand-text-muted)]">{dataLabel}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-ok-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-ok)]"><Check size={12} strokeWidth={2.5} aria-hidden /> <span className="font-mono tabular-nums">{eseguiti}</span></span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-ko-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-ko)]"><X size={12} strokeWidth={2.5} aria-hidden /> <span className="font-mono tabular-nums">{nonEseguiti}</span></span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-text-subtle)]"><span className="font-mono tabular-nums">{daFare}</span> da fare</span>
        {(mostraSaracinesche || saracinesche > 0) && (
          <span title="Saracinesche esitate" className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary-text)]">Saracinesche <span className="font-mono tabular-nums">{saracinesche}</span></span>
        )}
        <span className="ml-auto font-mono text-[11px] font-semibold tabular-nums text-[var(--brand-text-subtle)]">{completati}/{totali}</span>
      </div>

      {lavorazioni.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {lavorazioni.map((l) => (
            <span key={l.chiave} className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-text-muted)]">
              {l.etichetta} <span className="font-mono font-semibold tabular-nums text-[var(--primary-text)]">{l.count}</span>
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
