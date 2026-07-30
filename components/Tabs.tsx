import * as React from 'react';

type TabItem = {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * Quante righe CONTIENE la scheda: un numero smorzato accanto all'etichetta.
   *
   * È un'informazione diversa dal `badge`, e i due convivono: il conteggio dice quanto pesa la
   * vista prima di entrarci (anche 0, che qui è una risposta: la scheda è vuota), il badge grida
   * un'attesa. Additivo: chi non lo passa resta com'era.
   */
  count?: number;
  /**
   * Contatore d'ALLARME accanto all'etichetta: quante cose ASPETTANO in quella scheda.
   *
   * Additivo: le altre schede non lo passano e restano com'erano. Con 0 non si disegna niente —
   * un «0» in un badge d'avviso è una rassicurazione che occupa lo spazio di un allarme.
   */
  badge?: number;
  /** Testo per chi non vede il colore: cosa CONTA quel numero («3 riaperture senza esecutore»). */
  badgeLabel?: string;
};

type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  className?: string;
};

export default function Tabs({ value, onValueChange, items, className = '' }: TabsProps) {
  return (
    <div className={`inline-flex items-end gap-1 border-b border-[var(--brand-border)] ${className}`}>
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:pointer-events-none disabled:opacity-50 ${
              active
                ? 'border-[var(--brand-primary)] text-[var(--primary-text)]'
                : 'border-transparent text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]'
            }`}
          >
            {item.label}
            {/*
              Il conteggio è testo, non un badge: smorzato, `tabular-nums`, formattato
              all'italiana. Fa parte del nome del tasto («Chiusi 466») e uno screen reader lo
              legge così com'è — nessun attributo, nessun trucco.
            */}
            {typeof item.count === 'number' && (
              <span className="ml-1.5 font-mono text-xs font-normal tabular-nums text-[var(--brand-text-muted)]">
                {item.count.toLocaleString('it-IT')}
              </span>
            )}
            {/*
              `--status-warn`: qui il colore È l'informazione — lavoro scoperto — non un aiuto
              alla lettura (DESIGN.md §«Semantici e stato»). Il numero resta dentro il bottone:
              cliccarlo è già la risposta giusta al vederlo.

              Il pallino è `aria-hidden` e il testo completo sta in uno span `sr-only`: un
              `aria-label` sul pallino stesso sarebbe vietato (uno span è `generic`, ruolo a cui
              ARIA proibisce il nome) e alcuni lettori lo ignorano — che qui vorrebbe dire
              annunciare «Riaperture 3» senza dire 3 COSA, su un numero che di proposito non
              conta le righe della scheda.
            */}
            {typeof item.badge === 'number' && item.badge > 0 && (
              <>
                <span
                  aria-hidden="true"
                  title={item.badgeLabel}
                  className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--status-warn)] px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--on-warning)]"
                >
                  {item.badge}
                </span>
                {item.badgeLabel && <span className="sr-only">{item.badgeLabel}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
