/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { Check } from 'lucide-react';
import type { SaveStateOffline } from '@/lib/offline/types';

/** Stato del badge di salvataggio: alias del tipo condiviso (unica fonte di verità). */
export type SaveState = SaveStateOffline;

export function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  // Markup a mano e non il primitivo Badge: questo è lo stato di salvataggio (con
  // l'offline in mezzo), quindi resta a text-xs=12 — Badge impone 11 — e `saving`
  // ha un bordo che nessun variant del primitivo prevede.
  // `queued` usava `var(--warning-fg, <hex>)`: token INESISTENTE, quindi rendeva
  // il fallback — un marrone fisso identico in light e dark (DESIGN.md §9).
  // Rimpiazzato con `--status-warn`, il token d'INTENTO «warn / in attesa» (§3): qui il
  // colore È l'informazione, e allinea questo badge agli altri quattro, che già usano
  // gli `--status-*`. (Nei banner di testo lungo vince invece `--brand-text-main`:
  // là il colore serve alla leggibilità, non a dire di che stato si tratta.)
  const map: Record<Exclude<SaveState, 'idle'>, { label: string; cls: string }> = {
    saving: { label: 'salvataggio…', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)] border-[var(--brand-border)]' },
    saved: { label: 'salvato', cls: 'bg-[var(--status-ok-soft)] text-[var(--status-ok)] border-transparent' },
    error: { label: 'non salvato — riprova', cls: 'bg-[var(--status-ko-soft)] text-[var(--status-ko)] border-transparent' },
    queued: { label: 'in attesa di rete', cls: 'bg-[var(--status-warn-soft)] text-[var(--status-warn)] border-transparent' },
    bloccato: { label: 'da risolvere', cls: 'bg-[var(--status-ko-soft)] text-[var(--status-ko)] border-transparent' },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`} aria-live="polite">
      {(state === 'saving' || state === 'queued') && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />}
      {state === 'saved' && <Check size={12} strokeWidth={2.5} aria-hidden />}
      {label}
    </span>
  );
}