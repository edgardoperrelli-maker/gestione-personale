'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { pageTransition, pageTransitionTween } from '@/lib/animations';

/**
 * Transizione di pagina "enter-only": niente AnimatePresence mode="wait",
 * che serializzava exit (~300ms) + enter (~300ms) di animazione pura a ogni
 * cambio modulo. La nuova pagina entra con un fade breve appena è pronta.
 */
export function PageTransitionWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={pageTransitionTween}
    >
      {children}
    </motion.div>
  );
}
