import * as React from 'react';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean };

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className = '', error = false, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={error || undefined}
    className={`w-full rounded-[var(--radius-md)] border bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-[var(--brand-surface-muted)] disabled:opacity-60 ${
      error
        ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
        : 'border-[var(--brand-border)] hover:border-[var(--brand-border-strong)] focus:border-[var(--brand-primary)] focus:ring-[var(--brand-primary)]'
    } ${className}`}
    {...props}
  />
));

Select.displayName = 'Select';

export default Select;
