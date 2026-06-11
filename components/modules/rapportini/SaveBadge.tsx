'use client';

import type { SaveStateOffline } from '@/lib/offline/types';

/** Stato del badge di salvataggio: alias del tipo condiviso (unica fonte di verità). */
export type SaveState = SaveStateOffline;

export function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map: Record<Exclude<SaveState, 'idle'>, { label: string; cls: string }> = {
    saving: { label: 'salvataggio…', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)] border-[var(--brand-border)]' },
    saved: { label: 'salvato ✓', cls: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent' },
    error: { label: 'non salvato — riprova', cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent' },
    queued: { label: 'in attesa di rete', cls: 'bg-[var(--warning-soft,#fef3c7)] text-[var(--warning-fg,#92400e)] border-transparent' },
    bloccato: { label: 'da risolvere', cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent' },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`} aria-live="polite">
      {(state === 'saving' || state === 'queued') && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}
