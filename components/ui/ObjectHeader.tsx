import * as React from 'react';

/**
 * Card di testa di un modulo (sistema Cockpit): titolo + sottotitolo, ribbon di
 * stato opzionale, azioni primarie a destra. Vive su canvas, superficie bianca.
 */
export default function ObjectHeader({
  title,
  sub,
  ribbon,
  actions,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  ribbon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-5 py-4 shadow-[var(--shadow-sm)] sm:px-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-[-0.015em] text-[var(--brand-text-main)]">{title}</h1>
        {sub && <p className="mt-0.5 text-[12.5px] text-[var(--brand-text-muted)]">{sub}</p>}
      </div>
      {ribbon}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Ribbon di stato per ObjectHeader (es. «Sincronizzato»). */
export function StatusRibbon({ children, tone = 'ok' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'ko' }) {
  const color = tone === 'ok' ? 'var(--status-ok)' : tone === 'warn' ? 'var(--status-warn)' : 'var(--status-ko)';
  const bg = tone === 'ok' ? 'var(--status-ok-soft)' : tone === 'warn' ? 'var(--status-warn-soft)' : 'var(--status-ko-soft)';
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-bold"
      style={{ color, backgroundColor: bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {children}
    </span>
  );
}
