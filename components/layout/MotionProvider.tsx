'use client';

// Rispetto globale di prefers-reduced-motion per TUTTE le animazioni
// framer-motion (hover/tap/stagger inclusi): con "user", i transform
// collassano e resta solo l'opacità. Montato nel root layout.

import { MotionConfig } from 'framer-motion';

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
