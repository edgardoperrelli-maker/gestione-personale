'use client';

export function FabInterventoManuale({ abilitato, onClick }: { abilitato: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!abilitato}
      aria-label="Aggiungi intervento manuale"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)] shadow-lg transition enabled:hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
