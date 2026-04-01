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
      className={`inline-flex items-center rounded-xl border border-[var(--brand-border)] bg-white shadow-sm ${
        className
      }`}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onValueChange(item.value)}
          className={`px-3 py-1.5 text-sm transition ${
            value === item.value
              ? 'bg-[var(--brand-primary)] text-white'
              : 'text-[var(--brand-text-muted)] hover:bg-[var(--brand-nav-active-bg)]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
