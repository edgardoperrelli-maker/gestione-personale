'use client';

import type { ReactNode } from 'react';
import { Children } from 'react';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/animations';

export function StaggerGrid({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={className}
    >
      {Children.map(children, (child, index) => (
        <motion.div variants={staggerItem} key={index} className="h-full">
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
