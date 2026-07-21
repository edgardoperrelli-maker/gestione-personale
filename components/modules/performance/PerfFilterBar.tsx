'use client';
import { type PerfFilters, type SelectOption, formatItDate } from '@/lib/performance/shape';
import Button from '@/components/Button';

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

  const field = 'rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
      {/* Cluster Periodo */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" value={value.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className={field} aria-label="Da" />
        <span className="text-xs text-[var(--brand-text-subtle)]">→</span>
        <input type="date" value={value.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className={field} aria-label="A" />
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetSettimana}>Sett.</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetMese}>Mese</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetTrimestre}>Trim.</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetAnno}>Anno</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetTutto}>Tutto</Button>
        </div>
        {invalid && <span className="text-xs text-[var(--danger)]">Da &gt; A</span>}
        {value.dateFrom && value.dateTo && !invalid && (
          <span className="text-xs text-[var(--brand-text-subtle)]">{formatItDate(value.dateFrom)}–{formatItDate(value.dateTo)}</span>
        )}
      </div>

      {/* Divider */}
      <div className="hidden h-5 w-px bg-[var(--brand-border)] sm:block" aria-hidden />

      {/* Cluster Segmentazione */}
      <div className="flex flex-wrap items-center gap-1.5">
        {showOperatore && (
          <select value={value.staffId} onChange={(e) => set({ staffId: e.target.value })} className={field} aria-label="Operatore">
            <option value="">Tutti gli operatori</option>
            {options.operatori.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <select value={value.committente} onChange={(e) => set({ committente: e.target.value })} className={field} aria-label="Committente">
          <option value="">Tutti i committenti</option>
          {options.committenti.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={value.gruppo} onChange={(e) => set({ gruppo: e.target.value })} className={field} aria-label="Gruppo attività">
          <option value="">Tutti i gruppi</option>
          {options.gruppi.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select value={value.attivita} onChange={(e) => set({ attivita: e.target.value })} className={field} aria-label="Attività">
          <option value="">Tutte le attività</option>
          {options.attivita.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select value={value.territorioId} onChange={(e) => set({ territorioId: e.target.value })} className={field} aria-label="Territorio">
          <option value="">Tutti i territori</option>
          {options.territori.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--brand-text-muted)]">
          <input type="checkbox" checked={value.soloValvola} onChange={(e) => set({ soloValvola: e.target.checked })} className="accent-[var(--brand-primary)]" />
          Solo saracinesca
        </label>
      </div>
    </div>
  );
}
