// Classi dei comandi del Riepilogo, condivise fra CardTerritorio e MenuSposta.
// Stanno qui e non dentro CardTerritorio perché MenuSposta è importato da
// CardTerritorio: esportarle da lì creerebbe un ciclo.

/**
 * Comando a sola icona nella riga operatore. 24px netti — il minimo toccabile —
 * e nessun fill accentato: l'accento zaffiro porta le azioni primarie del modulo
 * (DESIGN.md §1.2), non decora otto comandi per riga ripetuti su ogni rapportino.
 */
export const AZIONE_ICONA =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ' +
  'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-muted)] ' +
  'transition-colors hover:border-[var(--brand-border-strong)] hover:text-[var(--brand-text-main)] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ' +
  'disabled:pointer-events-none disabled:opacity-50';

/** Come sopra, ma il hover vira al rosso: usato per i comandi che tolgono qualcosa. */
export const AZIONE_ICONA_DANGER =
  `${AZIONE_ICONA} hover:border-[var(--danger)] hover:text-[var(--danger)]`;

/** Comando testuale di card/piano (Riapri, Sposta, Elimina): 12px, mai 10. */
export const AZIONE_TESTO =
  'inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-medium ' +
  'text-[var(--brand-text-muted)] transition-colors hover:text-[var(--brand-text-main)] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ' +
  'disabled:pointer-events-none disabled:opacity-50';

/** Variante accentata del comando testuale: il rientro in pianificazione. */
export const AZIONE_TESTO_PRIMARIA =
  'inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-semibold ' +
  'text-[var(--primary-text)] transition-colors hover:text-[var(--brand-primary)] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]';

/** Variante distruttiva del comando testuale (conferma di eliminazione). */
export const AZIONE_TESTO_DANGER =
  'inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-semibold ' +
  'text-[var(--danger)] transition-colors hover:opacity-80 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] ' +
  'disabled:pointer-events-none disabled:opacity-50';
