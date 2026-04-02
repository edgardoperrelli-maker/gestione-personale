import * as React from 'react';

type TabItem = {
  value: string;
  label: string;
};

type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  className?: string;
};

export default function Tabs({ value, onValueChange, items, className = '' }: TabsProps) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-0.5 shadow-sm ${className}`}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onValueChange(item.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              active
                ? 'bg-[var(--brand-primary)] text-white shadow-sm'
                : 'text-[var(--brand-text-muted)] hover:bg-white hover:text-[var(--brand-text-main)]'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
