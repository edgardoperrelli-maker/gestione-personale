'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cardHover, staggerItem } from '@/lib/animations';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  animated?: boolean;
};

export function Card({ className = '', interactive = false, animated = true, ...props }: CardProps) {
  const classes = `rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] transition hover:border-[var(--brand-primary-border)] hover:shadow-[var(--shadow-hover)] ${className}`;

  if (!animated) {
    return <div className={classes} {...props} />;
  }

  if (interactive) {
    return (
      <motion.div
        className={classes}
        whileHover={cardHover.whileHover}
        whileTap={cardHover.whileTap}
        transition={cardHover.transition}
        {...(props as React.ComponentProps<typeof motion.div>)}
      />
    );
  }

  return (
    <motion.div
      className={classes}
      variants={staggerItem}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-50px' }}
      {...(props as React.ComponentProps<typeof motion.div>)}
    />
  );
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-b border-[var(--brand-border)] px-4 py-3 ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-4 py-4 ${className}`} {...props} />;
}

export function CardFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-t border-[var(--brand-border)] px-4 py-3 ${className}`} {...props} />;
}
