import type { Variants, Transition } from 'framer-motion';

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
};

// Tween breve al posto dello spring 300/30: lo spring impiegava ~300-450ms ad
// assestarsi per fase e, con AnimatePresence mode="wait", raddoppiava (exit+enter).
export const pageTransitionTween: Transition = {
  duration: 0.16,
  ease: 'easeOut',
};

export const staggerContainer: Variants = {
  initial: { opacity: 1 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 24 },
  },
};

export const cardHover = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring' as const, stiffness: 400, damping: 20 },
};

export const buttonHover = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
};

export const iconSpin = {
  whileHover: { rotate: 12, scale: 1.1 },
  transition: { type: 'spring' as const, stiffness: 300 },
};
