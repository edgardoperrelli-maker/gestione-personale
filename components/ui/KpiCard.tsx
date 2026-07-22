import * as React from 'react';

type Tone = 'primary' | 'ok' | 'warn' | 'ko';

const TONE_COLOR: Record<Tone, string> = {
  primary: 'var(--brand-primary)',
  ok: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  ko: 'var(--status-ko)',
};

/**
 * KPI del cockpit: barra colorata a sinistra, valore mono tabulare, trend e
 * sparkline CSS opzionali. Solo numeri che i motori espongono già — mai inventati.
 */
export function KpiCard({
  label,
  value,
  trend,
  tone = 'primary',
  spark,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  trend?: React.ReactNode;
  tone?: Tone;
  spark?: number[];
}) {
  const max = spark?.length ? Math.max(...spark, 1) : 1;
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 shadow-[var(--shadow-sm)]">
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: TONE_COLOR[tone] }} aria-hidden />
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--brand-text-muted)]">{label}</div>
      <div className="mt-1 font-mono text-[26px] font-semibold leading-none tracking-[-0.02em] text-[var(--brand-text-main)] tabular-nums">
        {value}
      </div>
      {trend && <div className="mt-1.5 text-[11.5px] text-[var(--brand-text-muted)]">{trend}</div>}
      {spark && spark.length > 1 && (
        <div className="absolute bottom-2.5 right-3 flex h-6 items-end gap-[2px] opacity-70" aria-hidden>
          {spark.map((v, i) => (
            <span
              key={i}
              className="w-1 rounded-[2px]"
              style={{
                height: `${Math.max(12, Math.round((v / max) * 100))}%`,
                backgroundColor: i === spark.length - 1 ? TONE_COLOR[tone] : 'var(--brand-primary-soft)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Variazione dentro il trend: verde se positiva, rossa se negativa. */
export function KpiDelta({ children, negative }: { children: React.ReactNode; negative?: boolean }) {
  return (
    <b style={{ color: negative ? 'var(--status-ko)' : 'var(--status-ok)' }} className="font-semibold">
      {children}
    </b>
  );
}

/** Griglia responsive per le KpiCard (1→2→4 colonne). */
export function KpiStrip({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
