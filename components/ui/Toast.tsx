'use client';

// Sistema toast unico del design system (sostituisce gli alert() nativi).
// API imperativa: toast.success('…') / toast.error('…') / toast.info('…').
// <Toaster /> va montato UNA volta per albero (AppShell per l'hub; i portali
// token lo montano nel proprio layout quando migrano).

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

let listener: ((t: ToastItem) => void) | null = null;
let nextId = 1;

function push(kind: ToastKind, message: string) {
  listener?.({ id: nextId++, kind, message });
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

const DOT: Record<ToastKind, string> = {
  success: 'var(--status-ok)',
  error: 'var(--status-ko)',
  info: 'var(--status-progress)',
};

// Gli errori restano visibili più a lungo del feedback di successo.
const TTL_MS: Record<ToastKind, number> = { success: 4500, info: 4500, error: 8000 };
const MAX_VISIBILI = 4;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    listener = (t) => {
      setItems((prev) => [...prev.slice(-(MAX_VISIBILI - 1)), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), TTL_MS[t.kind]);
    };
    return () => {
      listener = null;
    };
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3.5 py-2.5 shadow-[var(--shadow-md)]"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: DOT[t.kind] }}
            />
            <span className="min-w-0 flex-1 text-sm text-[var(--brand-text-main)]">{t.message}</span>
            <button
              type="button"
              aria-label="Chiudi notifica"
              onClick={() => dismiss(t.id)}
              className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--brand-text-subtle)] transition-colors hover:bg-[var(--brand-surface-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
