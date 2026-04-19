'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cardHover, staggerItem } from '@/lib/animations';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  animated?: boolean;
};

export function Card({ className = '', interactive = false, animated = true, ...props }: CardProps) {
  const classes = `rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm ${className}`;

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
