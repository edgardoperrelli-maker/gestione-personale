/**
 * Loading boundary per i moduli dell'hub: con layout e pagine force-dynamic,
 * senza questo file il click sulla sidebar non dava alcun feedback finché il
 * server non completava auth + query. Lo skeleton appare subito e Next può
 * fare streaming del contenuto quando è pronto.
 */
export default function HubLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Caricamento modulo">
      <div className="h-8 w-64 rounded-lg bg-[var(--brand-surface)]" />
      <div className="h-4 w-96 max-w-full rounded bg-[var(--brand-surface)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]"
          />
        ))}
      </div>
    </div>
  );
}
