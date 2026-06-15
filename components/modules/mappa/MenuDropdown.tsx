'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
};

export default function MenuDropdown({
  label,
  items,
  buttonClassName,
  align = 'right',
}: {
  label: ReactNode;
  items: MenuItem[];
  buttonClassName?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const visible = items.filter((it) => !it.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-1 min-w-[220px] rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {visible.map((it, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-[var(--brand-text-main)] transition hover:bg-[var(--brand-surface-muted)] disabled:opacity-40"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
