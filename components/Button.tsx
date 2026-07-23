'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { buttonHover } from '@/lib/animations';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  animated?: boolean;
  /** Stato di caricamento: spinner + aria-busy, il bottone è disabilitato finché dura. */
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand-primary)] text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)]',
  secondary: 'border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]',
  outline: 'border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]',
  ghost: 'text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]',
  soft: 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)] hover:bg-[var(--brand-primary-border)]',
  danger: 'bg-[var(--danger)] text-[var(--on-danger)] hover:opacity-90',
  gold: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)] border border-[var(--brand-border-strong)] hover:bg-[var(--brand-surface)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'outline',
      size = 'md',
      className = '',
      type = 'button',
      animated = true,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const classes = `inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-2 focus:ring-offset-[var(--brand-surface)] disabled:pointer-events-none disabled:opacity-50 ${animated ? '' : 'active:translate-y-px '}${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
    const content = (
      <>
        {loading && <Spinner />}
        {children}
      </>
    );

    if (!animated) {
      return (
        <button ref={ref} type={type} className={classes} disabled={isDisabled} aria-busy={loading || undefined} {...props}>
          {content}
        </button>
      );
    }

    return (
      <motion.button
        ref={ref}
        type={type}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        whileHover={buttonHover.whileHover}
        whileTap={buttonHover.whileTap}
        transition={buttonHover.transition}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {content}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
