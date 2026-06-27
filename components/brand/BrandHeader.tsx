import { BRAND } from '@/lib/brand';

/**
 * Intestazione brandizzata per le pagine che apre il personale (rapportino, agenda, P.I.).
 * Mostra il logo aziendale e, se passato, un sottotitolo/saluto personalizzato — così la
 * pagina non è più "anonima" ma chiaramente Plenzich.
 */
export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      {/* Badge bianco: il logo ha la scritta blu scuro, va su fondo chiaro per
          restare leggibile sia sul tema scuro che su quello chiaro dell'app. */}
      <span className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo statico in /public, no next/image */}
        <img src={BRAND.logo} alt={BRAND.nomeLegale} className="h-7 w-auto sm:h-8" />
      </span>
      {subtitle && (
        <span className="text-sm font-medium" style={{ color: 'var(--brand-text-muted)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
