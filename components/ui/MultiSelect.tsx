// components/ui/MultiSelect.tsx
// Select a scelta multipla (checkbox in popover) con trigger nello stile dei select
// dei filtri: "Etichetta: tutti" / valore singolo / "N selezionati".
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type MultiSelectOption = { value: string; label: string };

type MultiSelectProps = {
  /** Etichetta mostrata nel trigger (es. "Esecutore"). */
  label: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Classi per bordo/sfondo del trigger (sostituisce il default border/bg). */
  triggerClassName?: string;
  /** Stato errore: bordo danger + aria-invalid (allineato a Input/Select/Textarea). */
  error?: boolean;
};

export default function MultiSelect({
  label,
  options,
  values,
  onChange,
  disabled = false,
  ariaLabel,
  triggerClassName = 'border border-[var(--brand-border-strong)] bg-[var(--brand-bg)]',
  error = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Chiusura su click esterno + Esc (stesso pattern del DatePicker).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const riepilogo = useMemo(() => {
    if (values.length === 0) return 'tutti';
    if (values.length === 1) return options.find((o) => o.value === values[0])?.label ?? values[0];
    return `${values.length} selezionati`;
  }, [values, options]);

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        data-error={error || undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--brand-text-main)] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none ${triggerClassName} ${
          error
            ? 'border-[var(--danger)]'
            : values.length > 0
              ? 'border-[var(--brand-primary)]'
              : 'hover:border-[var(--brand-primary-border)]'
        }`}
      >
        <span className="truncate text-left">{label}: {riepilogo}</span>
        <span aria-hidden className="shrink-0 text-[10px] text-[var(--brand-text-muted)]">▼</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel ?? label}
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1 shadow-[var(--shadow-md)]"
        >
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false); }}
            className="mb-1 w-full rounded-[var(--radius-sm)] border-b border-[var(--brand-border)] px-2 py-1.5 text-left text-xs font-semibold text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)] hover:text-[var(--brand-text-main)]"
          >
            Tutti (azzera selezione)
          </button>
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-[var(--brand-text-muted)]">Nessuna opzione.</div>
          )}
          {options.map((o) => {
            const checked = values.includes(o.value);
            return (
              <label
                key={o.value}
                role="option"
                aria-selected={checked}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                />
                <span className="truncate">{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
