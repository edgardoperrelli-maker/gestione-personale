'use client';

import { useState } from 'react';

/**
 * Pulsante flottante "Sincronizza e aggiorna" (due frecce che si rincorrono) per le pagine
 * operatore. Sta nella pila dei FAB, sopra la lente e il "+". Gira durante l'invio; mostra il
 * conteggio in coda come badge. Premibile anche a coda vuota (rassicurazione di fine giornata).
 * Oltre a sincronizzare la coda, RICARICA la pagina così l'operatore vede gli ultimi dati dal
 * server (es. interventi aggiunti dall'ufficio). La reidratazione ripristina le modifiche locali
 * da IndexedDB → nessuna perdita; offline la ricarica serve la cache (innocuo).
 * `bottom` è passato come stringa (calc con safe-area) per impilarlo sopra gli altri FAB.
 */
export function FabSync({
  inAttesa,
  online,
  onSync,
  bottom,
}: {
  inAttesa: number;
  online: boolean;
  onSync: () => Promise<void>;
  bottom: string;
}) {
  const [girando, setGirando] = useState(false);

  const click = async () => {
    if (girando) return;
    setGirando(true);
    try {
      await onSync();
    } finally {
      // Sincronizza E aggiorna: ricarica per riallineare la pagina al server. La reidratazione
      // (RapportinoForm) ripristina le modifiche locali → niente perdita anche offline.
      if (typeof window !== 'undefined') window.location.reload();
    }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={girando}
      aria-label="Sincronizza e aggiorna"
      title={online ? 'Sincronizza e aggiorna la pagina' : 'Offline: i dati sono salvati. Premi per aggiornare (online partiranno)'}
      style={{ bottom }}
      className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] shadow-lg transition active:scale-95 disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-6 w-6 ${girando ? 'animate-spin' : ''}`}
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
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-bold text-[oklch(0.16_0.06_245)]">
          {inAttesa}
        </span>
      )}
    </button>
  );
}
