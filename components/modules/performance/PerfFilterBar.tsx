'use client';
import { type PerfFilters, type SelectOption, formatItDate } from '@/lib/performance/shape';
import Button from '@/components/Button';
import MultiSelect from '@/components/ui/MultiSelect';
import { ArrowRight } from 'lucide-react';

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface FilterOptions {
  operatori: SelectOption[];
  territori: SelectOption[];
  committenti: SelectOption[];
  gruppi: SelectOption[];
  attivita: SelectOption[];
  minDate: string | null;
}

const trigger = 'border border-[var(--brand-border)] bg-[var(--brand-surface)]';

/** Barra filtri compatta e indipendente (multi-selezione), usata da ogni grafico KPI. */
export default function PerfFilterBar({
  value, onChange, options, showOperatore = true,
}: {
  value: PerfFilters;
  onChange: (f: PerfFilters) => void;
  options: FilterOptions;
  showOperatore?: boolean;
}) {
  const set = (patch: Partial<PerfFilters>) => onChange({ ...value, ...patch });
  const invalid = Boolean(value.dateFrom && value.dateTo && value.dateFrom > value.dateTo);

  const now = new Date();
  const today = toISO(now);
  const setRange = (from: string, to: string) => set({ dateFrom: from, dateTo: to });
  const presetSettimana = () => { const dow = (now.getDay() + 6) % 7; const m = new Date(now); m.setDate(now.getDate() - dow); setRange(toISO(m), today); };
  const presetMese = () => setRange(toISO(new Date(now.getFullYear(), now.getMonth(), 1)), today);
  const presetTrimestre = () => setRange(toISO(new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 3), 1)), today);
  const presetAnno = () => setRange(toISO(new Date(now.getFullYear(), 0, 1)), today);
  const presetTutto = () => setRange('', '');

  // `py-1.5` e non `py-1`: i due campi data stanno in fila con i preset, che sono `Button
  // size="sm"` da 30px. Con `py-1` rendevano 26 — 4+16+2 di bordo — e la riga aveva due altezze.
  const field = 'rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-xs text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]';

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
      {/* Cluster Periodo */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" value={value.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className={field} aria-label="Da" />
        <ArrowRight size={13} className="shrink-0 text-[var(--brand-text-subtle)]" aria-hidden />
        <input type="date" value={value.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className={field} aria-label="A" />
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={presetSettimana}>Sett.</Button>
          <Button type="button" variant="ghost" size="sm" onClick={presetMese}>Mese</Button>
          <Button type="button" variant="ghost" size="sm" onClick={presetTrimestre}>Trim.</Button>
          <Button type="button" variant="ghost" size="sm" onClick={presetAnno}>Anno</Button>
          <Button type="button" variant="ghost" size="sm" onClick={presetTutto}>Tutto</Button>
        </div>
        {invalid && <span className="text-xs text-[var(--danger)]">Da &gt; A</span>}
        {value.dateFrom && value.dateTo && !invalid && (
          <span className="text-xs text-[var(--brand-text-subtle)]">{formatItDate(value.dateFrom)}–{formatItDate(value.dateTo)}</span>
        )}
      </div>

      {/* Divider */}
      <div className="hidden h-5 w-px bg-[var(--brand-border)] sm:block" aria-hidden />

      {/* Cluster Segmentazione (multi-selezione: nessuna selezione = tutti) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {showOperatore && (
          <div className="min-w-[9rem]">
            <MultiSelect label="Operatori" ariaLabel="Operatori" triggerClassName={trigger}
              options={options.operatori} values={value.staffIds} onChange={(staffIds) => set({ staffIds })} />
          </div>
        )}
        <div className="min-w-[9rem]">
          <MultiSelect label="Committenti" ariaLabel="Committenti" triggerClassName={trigger}
            options={options.committenti} values={value.committenti} onChange={(committenti) => set({ committenti })} />
        </div>
        <div className="min-w-[9rem]">
          <MultiSelect label="Gruppi" ariaLabel="Gruppi attività" triggerClassName={trigger}
            options={options.gruppi} values={value.gruppi} onChange={(gruppi) => set({ gruppi })} />
        </div>
        <div className="min-w-[9rem]">
          <MultiSelect label="Attività" ariaLabel="Attività" triggerClassName={trigger}
            options={options.attivita} values={value.attivita} onChange={(attivita) => set({ attivita })} />
        </div>
        <div className="min-w-[9rem]">
          <MultiSelect label="Territori" ariaLabel="Territori" triggerClassName={trigger}
            options={options.territori} values={value.territorioIds} onChange={(territorioIds) => set({ territorioIds })} />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--brand-text-muted)]">
          <input type="checkbox" checked={value.soloValvola} onChange={(e) => set({ soloValvola: e.target.checked })} className="accent-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--brand-surface-muted)]" />
          Solo saracinesca
        </label>
      </div>
    </div>
  );
}
