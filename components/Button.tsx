import * as React from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]',
  outline: 'border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-nav-active-bg)]',
  ghost: 'hover:bg-[var(--brand-nav-active-bg)]',
  soft: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] hover:bg-[var(--brand-nav-active-bg)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'outline', size = 'md', className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-2 focus:ring-offset-[var(--brand-surface)] disabled:pointer-events-none disabled:opacity-50 ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${className}`}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export default Button;
