'use client';
import type { ConfrontoOperator } from '@/lib/performance/shape';
import { colorForMacro } from './palette';

export default function PerformanceConfronto({
  operators, onSelect, selectedId,
}: {
  operators: ConfrontoOperator[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const max = Math.max(1, ...operators.map((o) => o.total));
  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Confronto operatori</h2>
      <p className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Interventi completati · ordinati per totale · barra divisa per attività · clicca per il dettaglio</p>
      {operators.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento per i filtri selezionati.</p>
      ) : (
        <div className="space-y-1">
          {operators.map((o) => {
            const segs = Object.entries(o.byMacro).sort((a, b) => b[1] - a[1]);
            const active = selectedId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.id)}
                className={`grid w-full grid-cols-[160px_1fr_56px] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${active ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-[var(--brand-primary)]/5'}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--brand-text-main)]">{o.name}</div>
                  <div className="truncate text-[11px] text-[var(--brand-text-muted)]">{segs.map(([k]) => k).join(', ') || '—'}</div>
                </div>
                <div className="h-3.5 overflow-hidden rounded-md bg-[var(--brand-border)]/40">
                  <div className="flex h-full" style={{ width: `${(o.total / max) * 100}%` }}>
                    {segs.map(([name, n]) => (
                      <div key={name} className="h-full" style={{ flex: n, background: colorForMacro(name) }} title={`${name}: ${n}`} />
                    ))}
                  </div>
                </div>
                <div className="text-right text-[13px] font-semibold tabular-nums text-[var(--brand-text-main)]">{o.total.toLocaleString('it-IT')}</div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
