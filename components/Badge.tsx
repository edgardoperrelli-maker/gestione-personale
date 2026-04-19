import * as React from 'react';

type BadgeVariant =
  | 'primary'
  | 'muted'
  | 'rosso'
  | 'giallo'
  | 'terracotta'
  | 'grafite'
  | 'success'
  | 'warning'
  | 'danger'
  | 'gold';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]',
  muted: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]',
  rosso: 'bg-[var(--kpi-rosso-bg)] text-[var(--kpi-rosso-text)]',
  giallo: 'bg-[var(--kpi-giallo-bg)] text-[var(--kpi-giallo-text)]',
  terracotta: 'bg-[var(--kpi-terracotta-bg)] text-[var(--kpi-terracotta-text)]',
  grafite: 'bg-[var(--kpi-grafite-bg)] text-[var(--kpi-grafite-text)]',
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  gold: 'bg-[var(--brand-gold-soft)] text-[var(--brand-text-main)]',
};

export default function Badge({ variant = 'primary', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        variantClasses[variant]
      } ${className}`}
      {...props}
    />
  );
}
