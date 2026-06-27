import { BRAND } from '@/lib/brand';

/**
 * Intestazione brandizzata per le pagine che apre il personale (rapportino, agenda, P.I.).
 * Mostra il logo aziendale e, se passato, un sottotitolo/saluto personalizzato — così la
 * pagina non è più "anonima" ma chiaramente Plenzich.
 */
export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo statico in /public, no next/image */}
      <img src={BRAND.logo} alt={BRAND.nomeLegale} width={176} height={38} className="h-9 w-auto sm:h-10" />
      {subtitle && (
        <span className="border-l pl-3 text-sm font-medium" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
