import * as React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] ${className}`}
    {...props}
  />
));

Input.displayName = 'Input';

export default Input;
