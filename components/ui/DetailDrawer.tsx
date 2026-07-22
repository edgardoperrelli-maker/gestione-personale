'use client';

import * as React from 'react';

/**
 * Drawer di dettaglio (sistema Cockpit): pannello a destra della tabella con la
 * scheda del record selezionato — si legge il dettaglio senza cambiare pagina.
 *
 * Composizione tipica:
 *   <DrawerSplit open={!!sel}>
 *     <tabella/>
 *     {sel && <DetailDrawer title=… onClose=…>…</DetailDrawer>}
 *   </DrawerSplit>
 */
export function DrawerSplit({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid items-start gap-4 ${open ? 'xl:grid-cols-[minmax(0,1fr)_372px]' : 'grid-cols-1'}`}>
      {children}
    </div>
  );
}

export function DetailDrawer({
  eyebrow,
  title,
  meta,
  onClose,
  footer,
  children,
}: {
  /** Riga sopra il titolo, es. «ODL 8801-4421 · ACEA» */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Riga sotto il titolo: stato, esecutore… */
  meta?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside className="flex flex-col rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-md)] xl:sticky xl:top-4">
      <div className="border-b border-[var(--brand-border)] px-4 py-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="font-mono text-xs font-semibold text-[var(--primary-text)]">{eyebrow}</div>}
            <h2 className="mt-0.5 truncate text-[15px] font-bold tracking-[-0.01em] text-[var(--brand-text-main)]">{title}</h2>
            {meta && <div className="mt-1.5 text-xs text-[var(--brand-text-muted)]">{meta}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi dettaglio"
            className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 py-3.5">{children}</div>
      {footer && <div className="flex gap-2 border-t border-[var(--brand-border)] px-4 py-3.5">{footer}</div>}
    </aside>
  );
}

/** Sezione del drawer con titoletto uppercase. */
export function DrawerSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--brand-text-subtle)]">{title}</h3>
      {children}
    </section>
  );
}

/** Coppie chiave/valore della scheda. */
export function DrawerKv({ rows }: { rows: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <dt className="text-[var(--brand-text-muted)]">{r.k}</dt>
          <dd className={r.mono ? 'font-mono tabular-nums' : 'font-medium'}>{r.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
