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

/**
 * Fondo del badge: i token `-soft` DI SISTEMA, non un color-mix al 16%.
 *
 * Il mix sintetizzava una scala soft parallela: alpha fissa mentre i token veri stanno a
 * 0.10–0.16 tarati per coppia, e un eventuale ritocco di sistema non l'avrebbe mai raggiunto.
 * Ogni accent ha già il suo fondo con nome: si usa quello (DESIGN.md §3, «--status-warn su
 * --status-warn-soft»).
 */
const STATO_SOFT: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:  'var(--status-idle-soft)',
  scaricato_deposito:      'var(--status-warn-soft)',
  verificato_deposito:     'var(--viola-soft)',
  in_consegna_committente: 'var(--status-progress-soft)',
  consegnato_committente:  'var(--status-ok-soft)',
};

export default function StatoBadge({ stato }: { stato: StatoMisuratore }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: STATO_ACCENT[stato], backgroundColor: STATO_SOFT[stato] }}
    >
      {STATO_LABEL[stato] ?? stato}
    </span>
  );
}
