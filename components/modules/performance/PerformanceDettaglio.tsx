'use client';
import { useState } from 'react';
import type { DettaglioRow } from '@/lib/performance/shape';
import { formatItDate } from '@/lib/performance/shape';

const PAGE_SIZE = 50;

export default function PerformanceDettaglio({ operatorName, rows }: { operatorName: string; rows: DettaglioRow[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const start = current * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Dettaglio · {operatorName}</h2>
        <span className="text-[11px] text-[var(--brand-text-muted)]">{rows.length.toLocaleString('it-IT')} interventi</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento per i filtri selezionati.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[var(--brand-text-muted)]">
                  <th className="py-1 pr-3 font-medium">Data</th>
                  <th className="py-1 pr-3 font-medium">Attività</th>
                  <th className="py-1 pr-3 font-medium">Tipo (origine)</th>
                  <th className="py-1 pr-3 font-medium">Committente</th>
                  <th className="py-1 pr-3 font-medium">Territorio</th>
                  <th className="py-1 font-medium">Esito</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--brand-border)]/50">
                    <td className="py-1.5 pr-3 text-[var(--brand-text-muted)]">{formatItDate(r.giorno)}</td>
                    <td className="py-1.5 pr-3 text-[var(--brand-text-main)]">{r.macro}</td>
                    <td className="py-1.5 pr-3 text-[var(--brand-text-muted)]">{r.intervento_tipo}</td>
                    <td className="py-1.5 pr-3 text-[var(--brand-text-muted)]">{r.committente}</td>
                    <td className="py-1.5 pr-3 text-[var(--brand-text-muted)]">{r.territorio}</td>
                    <td className="py-1.5 text-[var(--brand-text-muted)]">{r.esito}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--brand-text-muted)]">
              <span>{(start + 1).toLocaleString('it-IT')}–{Math.min(start + PAGE_SIZE, rows.length).toLocaleString('it-IT')} di {rows.length.toLocaleString('it-IT')}</span>
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-lg border border-[var(--brand-border)] px-2 py-1 hover:bg-[var(--brand-primary)]/10 disabled:opacity-40" disabled={current === 0} onClick={() => setPage(current - 1)}>← Prec.</button>
                <span>Pag. {current + 1} / {pages}</span>
                <button type="button" className="rounded-lg border border-[var(--brand-border)] px-2 py-1 hover:bg-[var(--brand-primary)]/10 disabled:opacity-40" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Succ. →</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
