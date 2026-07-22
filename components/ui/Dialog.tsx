'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'center' | 'sheet';
  className?: string;
  /** Operazione in corso: Escape, click sull'overlay e bottone Chiudi disattivati. */
  busy?: boolean;
};

export default function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'center',
  className = '',
  busy = false,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const reduced = useReducedMotion();

  // onClose è spesso passato inline (es. `() => setOpen(false)`): tenerlo fuori dalle
  // dipendenze dell'effetto sotto, altrimenti ogni render del parent (es. a ogni tasto
  // digitato in un input della dialog) ri-eseguirebbe l'effetto, rubando il focus.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const busyRef = React.useRef(busy);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const position = variant === 'sheet' ? 'items-end sm:items-center' : 'items-center';
  const panelShape =
    variant === 'sheet'
      ? 'w-full sm:max-w-lg rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)]'
      : 'w-full max-w-lg rounded-[var(--radius-xl)]';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={`fixed inset-0 z-50 flex justify-center ${position} p-0 sm:p-4`}
          style={{ background: 'var(--overlay)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={
              reduced
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.98, y: variant === 'sheet' ? 12 : 4 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduced
                ? { opacity: 0, transition: { duration: 0.1 } }
                : { opacity: 0, scale: 0.98, transition: { duration: 0.12 } }
            }
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`flex max-h-[90dvh] flex-col border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-lg)] focus:outline-none ${panelShape} ${className}`}
          >
            {title != null && (
              <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-4 py-3">
                <h2 id={titleId} className="text-base font-semibold text-[var(--brand-text-main)]">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  aria-label="Chiudi"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] p-1 text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:pointer-events-none disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-4 py-4">{children}</div>
            {footer != null && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--brand-border)] px-4 py-3">{footer}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
