import Skeleton from '@/components/ui/Skeleton';

/**
 * Loading boundary del cronoprogramma: feedback immediato alla navigazione
 * mentre il layout dinamico (auth + profilo) completa lato server.
 *
 * Usa il primitivo `Skeleton` (DESIGN.md §7) invece di blocchi `animate-pulse`
 * fatti a mano: così eredita shimmer, raggio a token e il rispetto di
 * `prefers-reduced-motion` senza doverli ripetere qui.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Caricamento cronoprogramma">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-[var(--radius-xl)]" />
        ))}
      </div>
    </div>
  );
}
