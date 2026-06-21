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
    <div className={`inline-flex items-end gap-1 border-b border-[var(--brand-border)] ${className}`}>
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onValueChange(item.value)}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
              active
                ? 'border-[var(--brand-primary)] text-[var(--primary-text)]'
                : 'border-transparent text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
