'use client';

/**
 * Pulsante flottante "Sincronizza e aggiorna" (due frecce che si rincorrono) per le pagine
 * operatore. Sta nella pila dei FAB, sopra la lente e il "+". Mostra il conteggio in coda
 * come badge. Al tap NON sincronizza in silenzio: apre la modale `ModaleSincronizza` che
 * mostra cosa sta inviando e offre "Aggiorna pagina".
 * `bottom` è passato come stringa (calc con safe-area) per impilarlo sopra gli altri FAB.
 */
export function FabSync({
  inAttesa,
  online,
  onApri,
  bottom,
}: {
  inAttesa: number;
  online: boolean;
  onApri: () => void;
  bottom: string;
}) {
  return (
    <button
      type="button"
      onClick={onApri}
      aria-label="Sincronizza e aggiorna"
      title={online ? 'Sincronizza e aggiorna la pagina' : 'Offline: i dati sono salvati. Apri per vedere la coda'}
      style={{ bottom }}
      className="fixed right-3 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] shadow-lg transition active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
      {inAttesa > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-bold text-[var(--on-primary)]">
          {inAttesa}
        </span>
      )}
    </button>
  );
}
