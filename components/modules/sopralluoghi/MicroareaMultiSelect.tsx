'use client';

import { useState } from 'react';
import Button from '@/components/Button';

type Props = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  helperText?: string;
  emptyText?: string;
  defaultExpanded?: boolean;
};

function sortValues(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, 'it'));
}

export default function MicroareaMultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  helperText,
  emptyText = 'Nessuna microarea disponibile',
  defaultExpanded = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleValue = (value: string) => {
    if (disabled) return;

    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }

    onChange(sortValues([...selected, value]));
  };

  const handleSelectAll = () => {
    if (disabled) return;
    onChange(sortValues(options));
  };

  const handleClear = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <label className="block text-sm font-medium text-[var(--brand-text-muted)]">
            {label}
          </label>
          {helperText && (
            <div className="mt-1 text-xs text-[var(--brand-text-muted)]">
              {helperText}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-[var(--brand-text-muted)]">
            {selected.length} selezionate
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            disabled={options.length === 0}
            aria-expanded={isExpanded}
          >
            {isExpanded ? 'Comprimi' : 'Espandi'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={disabled || options.length === 0}
          >
            Tutte
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={disabled || selected.length === 0}
          >
            Pulisci
          </Button>
        </div>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-4 text-sm text-[var(--brand-text-muted)]">
          {emptyText}
        </div>
      ) : !isExpanded ? (
        <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-4">
          {selected.length === 0 ? (
            <div className="text-sm text-[var(--brand-text-muted)]">
              Nessuna microarea selezionata. Premi <span className="font-medium text-[var(--brand-text-main)]">Espandi</span> per aprire la lista.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-[var(--brand-text-muted)]">
                Microaree selezionate
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.slice(0, 8).map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-text-main)]"
                  >
                    {value}
                  </span>
                ))}
                {selected.length > 8 && (
                  <span className="inline-flex items-center rounded-full border border-[var(--brand-border)] px-3 py-1 text-xs text-[var(--brand-text-muted)]">
                    +{selected.length - 8} altre
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--brand-border)] bg-white p-3">
          <div className="grid gap-2 md:grid-cols-2">
            {options.map((option) => {
              const checked = selected.includes(option);

              return (
                <label
                  key={option}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                    checked
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/60 text-[var(--brand-text-main)]'
                      : 'border-[var(--brand-border)] bg-white text-[var(--brand-text-main)]'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--brand-bg)]/50'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                  />
                  <span className="truncate">{option}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
