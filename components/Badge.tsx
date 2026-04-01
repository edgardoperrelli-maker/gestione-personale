import * as React from 'react';

type BadgeVariant = 'primary' | 'muted' | 'success' | 'danger';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]',
  muted: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  danger: 'bg-rose-100 text-rose-700',
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
