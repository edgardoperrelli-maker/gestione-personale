'use client';
import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function SezioneAccordion({ title, subtitle, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
      >
        <span className="flex flex-col">
          <span className="font-semibold text-[var(--brand-text-main)]">{title}</span>
          {subtitle && (
            <span className="mt-0.5 text-xs font-normal text-[var(--brand-text-muted)]">{subtitle}</span>
          )}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-[var(--brand-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      {open && <div className="border-t border-[var(--brand-border)] p-6 pt-4">{children}</div>}
    </div>
  );
}
