'use client';
import { MACRO_ATTIVITA, type PerfFilters, type SelectOption, formatItDate } from '@/lib/performance/shape';

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface FilterOptions {
  operatori: SelectOption[];
  territori: SelectOption[];
  committenti: SelectOption[];
  minDate: string | null;
}

/** Barra filtri compatta e indipendente, usata da ogni grafico KPI. */
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

  const field = 'rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-[12px] text-[var(--brand-text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';
  const preset = 'rounded-md border border-[var(--brand-border)] px-2 py-0.5 text-[11px] text-[var(--brand-text-muted)] hover:bg-[var(--brand-primary)]/10';

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--brand-border)]/60 bg-[var(--brand-bg)]/40 p-2">
      <input type="date" value={value.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className={field} aria-label="Da" />
      <span className="text-[var(--brand-text-muted)]">→</span>
      <input type="date" value={value.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className={field} aria-label="A" />
      <button type="button" className={preset} onClick={presetSettimana}>Sett.</button>
      <button type="button" className={preset} onClick={presetMese}>Mese</button>
      <button type="button" className={preset} onClick={presetTrimestre}>Trim.</button>
      <button type="button" className={preset} onClick={presetAnno}>Anno</button>
      <button type="button" className={preset} onClick={presetTutto}>Tutto</button>
      {invalid && <span className="text-[11px] text-[var(--danger)]">Da &gt; A</span>}

      {showOperatore && (
        <select value={value.staffId} onChange={(e) => set({ staffId: e.target.value })} className={field} aria-label="Operatore">
          <option value="">Tutti gli operatori</option>
          {options.operatori.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <select value={value.macro} onChange={(e) => set({ macro: e.target.value })} className={field} aria-label="Attività">
        <option value="">Tutte le attività</option>
        {MACRO_ATTIVITA.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={value.committente} onChange={(e) => set({ committente: e.target.value })} className={field} aria-label="Committente">
        <option value="">Tutti i committenti</option>
        {options.committenti.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select value={value.territorioId} onChange={(e) => set({ territorioId: e.target.value })} className={field} aria-label="Territorio">
        <option value="">Tutti i territori</option>
        {options.territori.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[var(--brand-text-muted)]">
        <input type="checkbox" checked={value.soloValvola} onChange={(e) => set({ soloValvola: e.target.checked })} className="accent-[var(--brand-primary)]" />
        Solo saracinesca
      </label>
      {value.dateFrom && value.dateTo && !invalid && (
        <span className="text-[11px] text-[var(--brand-text-subtle)]">{formatItDate(value.dateFrom)}–{formatItDate(value.dateTo)}</span>
      )}
    </div>
  );
}
