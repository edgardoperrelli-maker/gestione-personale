// Avviso a pagina intera per i portali token (/pi, /agenda): link non valido,
// scaduto, ecc. Prima esisteva in due copie identiche nelle pagine.

import { BrandHeader } from '@/components/brand/BrandHeader';

type AvvisoProps = {
  title: string;
  message: string;
  /** Mostra il logo Plenzich sopra la card (portali con brand in testa). */
  brand?: boolean;
};

export default function Avviso({ title, message, brand = false }: AvvisoProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--brand-bg)] px-4 text-[var(--brand-text-main)]">
      {brand && (
        <div className="mb-6">
          <BrandHeader />
        </div>
      )}
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center shadow-[var(--shadow-sm)]">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-[var(--brand-text-muted)]">{message}</p>
      </div>
    </main>
  );
}
