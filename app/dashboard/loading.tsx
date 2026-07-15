/**
 * Loading boundary del cronoprogramma: feedback immediato alla navigazione
 * mentre il layout dinamico (auth + profilo) completa lato server.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Caricamento cronoprogramma">
      <div className="h-8 w-72 rounded-lg bg-[var(--brand-surface)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-64 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]"
          />
        ))}
      </div>
    </div>
  );
}
