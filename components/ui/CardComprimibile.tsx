// Card comprimibile: chiusa di default, si apre al click sulla testa.
// Costruita su <details>/<summary> nativi — così apertura, tastiera (Invio/Spazio),
// screen reader e find-in-page funzionano SENZA stato client, e la card resta
// utilizzabile dentro un server component.
//
// Regola d'uso: nella TESTA vanno solo identità e conteggi (sola lettura). I controlli
// interattivi stanno nel corpo: un <input> o un <button> dentro <summary> intercetta
// il click di apertura ed è una trappola per chi naviga da tastiera.
//
// `scorrevole` mette il corpo in scroll interno: è ciò che impedisce alla pagina di
// modulo di allungarsi all'infinito quando una card ha molte righe.

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  /** Contenuto della testa: identità + conteggi, in sola lettura. */
  intestazione: React.ReactNode;
  /** Etichetta accessibile del comando di apertura (es. «Commessa AcquaLatina»). */
  etichetta: string;
  /** Aperta al primo render (default: chiusa). */
  apertaDiDefault?: boolean;
  /** Altezza massima del corpo prima dello scroll interno. Default `24rem`. */
  scorrevole?: string | false;
  className?: string;
  children: React.ReactNode;
};

export default function CardComprimibile({
  intestazione,
  etichetta,
  apertaDiDefault = false,
  scorrevole = '24rem',
  className = '',
  children,
}: Props) {
  return (
    <details
      open={apertaDiDefault}
      className={`group overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] ${className}`}
    >
      <summary
        aria-label={etichetta}
        className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 transition-colors hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)] group-open:border-b group-open:border-[var(--brand-border)] [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{intestazione}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className="shrink-0 text-[var(--brand-text-subtle)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div
        className={scorrevole ? 'overflow-y-auto overscroll-contain' : undefined}
        style={scorrevole ? { maxHeight: scorrevole } : undefined}
      >
        {children}
      </div>
    </details>
  );
}
