import * as React from 'react';
import { TriangleAlert } from 'lucide-react';

type TabItem = {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * Contatore d'ALLARME accanto all'etichetta: quante cose ASPETTANO in quella scheda.
   *
   * Si disegna come triangolo rosso + numero, perché deve dare nell'occhio da qualunque scheda —
   * è il segnale del lavoro che può sfuggire, non una statistica. Additivo: le altre schede non
   * lo passano e restano com'erano. Con 0 non si disegna niente — un «0» accanto a un triangolo
   * d'allarme è una rassicurazione che occupa lo spazio di un allarme.
   */
  badge?: number;
  /** Testo per chi non vede il colore: cosa CONTA quel numero («3 attivazioni senza data»). */
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
              `--status-ko`: qui il colore È l'informazione — lavoro che può sfuggire — non un
              aiuto alla lettura (DESIGN.md §«Semantici e stato»). Il numero resta dentro il
              bottone: cliccarlo è già la risposta giusta al vederlo.

              Triangolo e numero sono `aria-hidden` e il testo completo sta in uno span
              `sr-only`: un `aria-label` sul frammento sarebbe vietato (uno span è `generic`,
              ruolo a cui ARIA proibisce il nome) e alcuni lettori lo ignorano — che qui
              vorrebbe dire annunciare «Riaperture 3» senza dire 3 COSA.
            */}
            {typeof item.badge === 'number' && item.badge > 0 && (
              <>
                <span
                  aria-hidden="true"
                  title={item.badgeLabel}
                  className="ml-1.5 inline-flex items-center gap-0.5 align-middle font-mono text-xs font-semibold tabular-nums text-[var(--status-ko)]"
                >
                  <TriangleAlert size={13} aria-hidden="true" />
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
