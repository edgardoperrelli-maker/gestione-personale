import * as React from 'react';

export type StatTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'primary';

const TONE_COLOR: Record<StatTone, string> = {
  neutral: 'var(--brand-text-main)',
  ok: 'var(--success)',
  warn: 'var(--warning)',
  danger: 'var(--danger)',
  primary: 'var(--brand-primary)',
};

/**
 * Tessera-statistica densa del cockpit: label piccola + valore in mono tabulare
 * (accentato per `tone`) + nota opzionale. È un WELL senza bordo (fondo muted),
 * pensato per stare dentro una Card/Dialog senza fare card-in-card.
 *
 * Per i KPI "hero" a piena elevazione (barra colorata a sinistra, valore 26px)
 * usa invece `KpiCard`/`KpiStrip`. Solo numeri che i motori espongono già.
 */
export default function StatTile({
  label,
  value,
  note,
  tone = 'neutral',
  size = 'md',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: StatTone;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--brand-surface-muted)] px-3 py-2">
      <div className="text-[11px] text-[var(--brand-text-muted)]">{label}</div>
      <div
        className={`font-mono font-semibold tabular-nums ${size === 'sm' ? 'text-base' : 'text-lg'}`}
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-[10px] text-[var(--brand-text-subtle)]">{note}</div>}
    </div>
  );
}
