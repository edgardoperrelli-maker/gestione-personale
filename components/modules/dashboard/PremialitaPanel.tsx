'use client';

import {
  KPI_LABELS,
  SOGLIA_MINIMA,
  SOGLIA_PREMIO_ES,
  MESI_VALUTAZIONE,
  type KpiCode,
  type KpiResult,
} from '@/lib/premialita/acea';

const KPI_ORDER: KpiCode[] = ['EL', 'ES', 'ERC', 'ERA'];

/**
 * Cruscotto premialità Acea — visibile solo ad admin_plus (gating server-side
 * in app/hub/page.tsx). Finché gli esiti interventi non sono persistiti
 * (tabella `interventi`, Parte B), `kpis` è assente e si mostra un placeholder;
 * la regola di calcolo (lib/premialita/acea.ts) è già pronta e testata.
 */
export default function PremialitaPanel({ kpis }: { kpis?: KpiResult[] }) {
  const byCode = new Map((kpis ?? []).map((k) => [k.code, k]));
  const hasData = (kpis?.length ?? 0) > 0;

  return (
    <section className="border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-sm)]" style={{ borderRadius: 'var(--radius-xl)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--brand-surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-muted)] border border-[var(--brand-border)]">
            Admin Plus
          </span>
          <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Premialità Acea</h2>
        </div>
        <span className="text-xs text-[var(--brand-text-muted)]">soglia min. {SOGLIA_MINIMA}% · valutazione ogni {MESI_VALUTAZIONE} mesi</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {KPI_ORDER.map((code) => {
          const k = byCode.get(code);
          const eff = k?.efficienza;
          const ok = k?.sogliaOk;
          return (
            <div key={code} className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--brand-text-muted)]">{code}</span>
                <span
                  className={`font-mono text-lg font-semibold tabular-nums ${
                    eff == null
                      ? 'text-[var(--brand-text-subtle)]'
                      : ok
                        ? 'text-[var(--success)]'
                        : 'text-[var(--danger)]'
                  }`}
                >
                  {eff == null ? '—' : `${eff}%`}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-tight text-[var(--brand-text-muted)]">{KPI_LABELS[code]}</p>
              {k && (
                <p className="mt-1 text-[11px] text-[var(--brand-text-subtle)]">
                  Prezzo {k.variazionePrezzo > 0 ? '+' : ''}{k.variazionePrezzo}%
                  {k.code === 'ES' && k.premio && (
                    <span className="ml-1 font-semibold text-[var(--success)]">· premio attivo</span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!hasData && (
        <p className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--brand-border)] px-3 py-2 text-xs text-[var(--brand-text-muted)]">
          Dati non ancora disponibili: gli esiti interventi (eseguiti positivi, accessi a vuoto, assegnati)
          alimenteranno questi KPI quando la tracciatura interventi sarà attiva. Premio sospensioni a ES ≥ {SOGLIA_PREMIO_ES}%.
        </p>
      )}
    </section>
  );
}
