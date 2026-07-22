// Blocco shimmer sobrio per gli stati di caricamento con forma nota
// (righe tabella, card KPI, testo). Dimensioni via className (h-*/w-*).
type SkeletonProps = { className?: string };

export default function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)] motion-reduce:animate-none ${className}`}
    />
  );
}
