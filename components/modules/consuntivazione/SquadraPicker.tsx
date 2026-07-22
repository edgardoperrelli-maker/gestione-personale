'use client';

import MultiSelect from '@/components/ui/MultiSelect';

export type Operatore = { staffId: string; nome: string };

/**
 * Selezione della squadra esecutrice. Il PRIMO operatore selezionato è il primario: porta
 * staff_id + il valore economico (Produzione/premialità); gli altri risultano tra gli esecutori
 * (partecipazione in Performance operatori). L'ordine di selezione = ordine dei chip.
 */
export default function SquadraPicker({
  operatori,
  valori,
  onChange,
  disabilitato = false,
}: {
  operatori: Operatore[];
  valori: string[];
  onChange: (v: string[]) => void;
  disabilitato?: boolean;
}) {
  const options = operatori.map((o) => ({ value: o.staffId, label: o.nome }));
  const nome = (id: string) => operatori.find((o) => o.staffId === id)?.nome ?? id;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[var(--brand-text-muted)]">
        Squadra esecutrice
      </label>
      <MultiSelect
        label="Operatori"
        options={options}
        values={valori}
        onChange={onChange}
        disabled={disabilitato}
        ariaLabel="Operatori esecutori"
      />
      {valori.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valori.map((id, i) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2.5 py-1 text-xs text-[var(--brand-text-main)]"
            >
              {i === 0 && (
                <span className="rounded-full bg-[var(--brand-primary-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary-text)]">
                  primario
                </span>
              )}
              {nome(id)}
              {!disabilitato && (
                <button
                  type="button"
                  aria-label={`Rimuovi ${nome(id)}`}
                  onClick={() => onChange(valori.filter((x) => x !== id))}
                  className="text-[var(--brand-text-subtle)] hover:text-[var(--status-ko)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {valori.length > 1 && (
        <p className="text-[11px] text-[var(--brand-text-subtle)]">
          Il primario porta il valore economico; l&apos;intera squadra risulta tra gli esecutori.
        </p>
      )}
    </div>
  );
}
