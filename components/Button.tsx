'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { buttonHover } from '@/lib/animations';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'soft' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  animated?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]',
  outline: 'border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-nav-active-bg)]',
  ghost: 'hover:bg-[var(--brand-nav-active-bg)]',
  soft: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] hover:bg-[var(--brand-primary-border)]',
  gold: 'bg-[var(--brand-gold)] text-[var(--brand-text-main)] hover:bg-[var(--brand-gold-soft)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'outline', size = 'md', className = '', type = 'button', animated = true, ...props }, ref) => {
    const classes = `inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-2 focus:ring-offset-[var(--brand-surface)] disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

    if (!animated) {
      return <button ref={ref} type={type} className={classes} {...props} />;
    }

    return (
      <motion.button
        ref={ref}
        type={type}
        className={classes}
        whileHover={buttonHover.whileHover}
        whileTap={buttonHover.whileTap}
        transition={buttonHover.transition}
        {...(props as React.ComponentProps<typeof motion.button>)}
      />
    );
  }
);

Button.displayName = 'Button';

export default Button;
