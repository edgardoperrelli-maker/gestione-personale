import type { StatoMisuratore } from '@/types/misuratori';

// Le mappe di colore degli stati del misuratore — sorgente unica per card-contatore, rail di
// riga e select di stato. Solo token del sistema Cockpit, mai hex/neon.
//
// Il componente <StatoBadge> che dava il nome al file è stato rimosso il 2026-08-03: era
// codice MORTO (nessun call-site in tutto il codebase) e divergeva dal primitivo Badge di
// sistema, che le varianti di stato le ha già. Se un giorno serve un badge di stato del
// misuratore, si usa quello (DESIGN.md §7), non se ne ridisegna uno qui.

/**
 * Accento per ogni stato: il colore-SEGNALE — rail di riga, bordo del select, barra dei
 * contatori. Dove il colore marca e non si legge.
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
 * Colore-TESTO per ogni stato: dove il colore si LEGGE (il select di stato, a 12px).
 *
 * Diverge dall'accent in un punto solo, ed è il punto che l'ha reso necessario:
 * `--status-idle` è un token da pallini (L 0.62) e come testo normale fa 3,64:1 su bianco —
 * sotto il 4,5 dell'AA. Il suo testo è `--brand-text-muted`, che è grigio quanto serve
 * all'idle ma è un token DI TESTO, vincolato dalla guardia dei contrasti (7:1).
 */
export const STATO_TESTO: Record<StatoMisuratore, string> = {
  da_consegnare_deposito:  'var(--brand-text-muted)',
  scaricato_deposito:      'var(--status-warn)',
  verificato_deposito:     'var(--viola)',
  in_consegna_committente: 'var(--status-progress)',
  consegnato_committente:  'var(--status-ok)',
};
