import { STATO_LABEL, type StatoMisuratore } from '@/types/misuratori';

/**
 * Accento (token) per ogni stato del misuratore — sorgente unica per card-contatore,
 * rail di riga tabella e badge. Solo token del sistema Cockpit, mai hex/neon:
 * idle → in attesa (warn) → verificato (viola) → in consegna (progress) → consegnato (ok).
 */
export const STATO_ACCENT: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:  'var(--status-idle)',
  scaricato_deposito:      'var(--status-warn)',
  verificato_deposito:     'var(--viola)',
  in_consegna_committente: 'var(--status-progress)',
  consegnato_committente:  'var(--status-ok)',
};

export default function StatoBadge({ stato }: { stato: StatoMisuratore }) {
  const accent = STATO_ACCENT[stato];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: accent, backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)` }}
    >
      {STATO_LABEL[stato] ?? stato}
    </span>
  );
}
