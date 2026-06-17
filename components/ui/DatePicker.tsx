'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildMonthGrid,
  formatDisplay,
  monthLabel,
  parseIso,
  toIso,
  WEEKDAY_LABELS_IT,
} from './datePickerUtils';

type DatePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  /** Classi per bordo/sfondo del trigger (sostituisce il default border/bg). */
  triggerClassName?: string;
  ariaLabel?: string;
  fullWidth?: boolean;
};

export default function DatePicker({
  value,
  onChange,
  disabled = false,
  min,
  max,
  placeholder = 'gg/mm/aaaa',
  className = '',
  triggerClassName = '',
  ariaLabel = 'Seleziona data',
  fullWidth = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Vista mese/anno del popover (non è il valore selezionato).
  const [view, setView] = useState(() => {
    const p = parseIso(value);
    if (p) return { y: p.y, m: p.m };
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  // Alla riapertura riallinea la vista al valore (o al mese corrente).
  useEffect(() => {
    if (!open) return;
    const p = parseIso(value);
    if (p) {
      setView({ y: p.y, m: p.m });
      return;
    }
    const d = new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }, [open, value]);

  // Chiusura su click esterno + Esc.
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

  const grid = useMemo(() => buildMonthGrid(view.y, view.m), [view.y, view.m]);

  const now = new Date();
  const todayIso = toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const isDisabledDay = (iso: string) =>
    (min !== undefined && iso < min) || (max !== undefined && iso > max);

  const pick = (iso: string) => {
    if (isDisabledDay(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const prevMonth = () =>
    setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () =>
    setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }));

  return (
    <div ref={rootRef} className={`relative ${fullWidth ? 'block w-full' : 'inline-block'} ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`inline-flex items-center justify-between gap-2 rounded-lg ${
          triggerClassName || 'border border-[var(--brand-border)] bg-[var(--brand-surface)]'
        } px-3 py-2 text-sm text-[var(--brand-text-main)] transition focus:outline-none focus:border-[var(--brand-primary)] focus:shadow-[0_0_0_1px_var(--brand-primary)] ${
          fullWidth ? 'w-full' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--brand-primary-border)]'}`}
      >
        <span className={value ? '' : 'text-[var(--brand-text-subtle)]'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[var(--brand-text-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Calendario"
          className="absolute left-0 top-full z-[60] mt-2 w-72 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3"
          style={{ boxShadow: 'var(--shadow-lg), 0 0 18px oklch(0.80 0.16 215 / 0.25)' }}
        >
          {/* Header mese */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mese precedente"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--brand-border)] text-[var(--brand-text-main)] hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]"
            >
              ‹
            </button>
            <div className="text-sm font-semibold text-[var(--brand-text-main)]">
              {monthLabel(view.y, view.m)}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mese successivo"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--brand-border)] text-[var(--brand-text-main)] hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]"
            >
              ›
            </button>
          </div>

          {/* Intestazioni giorni */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            {WEEKDAY_LABELS_IT.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Griglia giorni */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell, idx) => {
              const isSelected = value === cell.iso;
              const isToday = todayIso === cell.iso;
              const dis = isDisabledDay(cell.iso);
              const weekend = idx % 7 >= 5;
              let cls: string;
              if (!cell.inMonth) {
                cls = 'text-[var(--brand-text-subtle)] opacity-40';
              } else if (isSelected) {
                cls = 'bg-[var(--brand-primary)] font-semibold text-[oklch(0.16_0.06_245)]';
              } else if (isToday) {
                cls = 'ring-1 ring-[var(--brand-primary)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]';
              } else {
                cls = `${weekend ? 'text-[var(--brand-text-muted)]' : 'text-[var(--brand-text-main)]'} hover:bg-[var(--brand-surface-muted)]`;
              }
              if (dis) cls += ' opacity-30 cursor-not-allowed';
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inMonth || dis}
                  onClick={() => cell.inMonth && pick(cell.iso)}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm transition ${cls}`}
                >
                  {cell.d}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t border-[var(--brand-border)] pt-2">
            <button
              type="button"
              onClick={() => pick(todayIso)}
              disabled={isDisabledDay(todayIso)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
