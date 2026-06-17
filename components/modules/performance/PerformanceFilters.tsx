'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatItDate, MACRO_ATTIVITA, type SelectOption } from '@/lib/performance/shape';

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PerformanceFilters({
  operatori, territori, committenti, minDate,
}: {
  operatori: SelectOption[];
  territori: SelectOption[];
  committenti: SelectOption[];
  minDate: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [dateFrom, setDateFrom] = useState(sp.get('dateFrom') ?? '');
  const [dateTo, setDateTo] = useState(sp.get('dateTo') ?? '');
  const [staffId, setStaffId] = useState(sp.get('staffId') ?? '');
  const [committente, setCommittente] = useState(sp.get('committente') ?? '');
  const [territorioId, setTerritorioId] = useState(sp.get('territorioId') ?? '');
  const [macro, setMacro] = useState(sp.get('macro') ?? '');

  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  const buildParams = (override?: { dateFrom?: string; dateTo?: string }) => {
    const from = override?.dateFrom ?? dateFrom;
    const to = override?.dateTo ?? dateTo;
    const p = new URLSearchParams();
    if (from) p.set('dateFrom', from);
    if (to) p.set('dateTo', to);
    if (staffId) p.set('staffId', staffId);
    if (committente) p.set('committente', committente);
    if (territorioId) p.set('territorioId', territorioId);
    if (macro) p.set('macro', macro);
    const sel = sp.get('selOperator');
    if (sel) p.set('selOperator', sel);
    return p;
  };

  const apply = () => router.push(`/hub/performance?${buildParams().toString()}`);
  const reset = () => {
    setDateFrom(''); setDateTo(''); setStaffId(''); setCommittente(''); setTerritorioId(''); setMacro('');
    router.push('/hub/performance');
  };

  const applyRange = (from: string, to: string) => {
    setDateFrom(from); setDateTo(to);
    router.push(`/hub/performance?${buildParams({ dateFrom: from, dateTo: to }).toString()}`);
  };
  const now = new Date();
  const today = toISO(now);
  const presetSettimana = () => {
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now); monday.setDate(now.getDate() - dow);
    applyRange(toISO(monday), today);
  };
  const presetMese = () => applyRange(toISO(new Date(now.getFullYear(), now.getMonth(), 1)), today);
  const presetTrimestre = () => applyRange(toISO(new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 3), 1)), today);
  const presetAnno = () => applyRange(toISO(new Date(now.getFullYear(), 0, 1)), today);
  const presetTutto = () => { if (minDate) applyRange(minDate, today); };

  const field = 'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]';
  const label = 'text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-text-muted)]';
  const preset = 'rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-[11px] text-[var(--brand-text-muted)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-text-main)] disabled:opacity-40';

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="pf-from" className={label}>Da</label>
          <input id="pf-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={field} />
        </div>
        <span className="pb-2 text-[var(--brand-text-muted)]">→</span>
        <div className="space-y-1">
          <label htmlFor="pf-to" className={label}>A</label>
          <input id="pf-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={field} />
        </div>
        {dateFrom && dateTo && !invalidRange && (
          <span className="pb-2 text-[11px] text-[var(--brand-text-muted)]">{formatItDate(dateFrom)} → {formatItDate(dateTo)}</span>
        )}
        {invalidRange && (
          <span className="pb-2 text-[11px] text-[var(--danger)]">Intervallo invertito: gli estremi verranno scambiati.</span>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={label}>Periodo:</span>
        <button type="button" className={preset} onClick={presetSettimana}>Settimana</button>
        <button type="button" className={preset} onClick={presetMese}>Mese</button>
        <button type="button" className={preset} onClick={presetTrimestre}>Trimestre</button>
        <button type="button" className={preset} onClick={presetAnno}>Anno</button>
        <button type="button" className={preset} onClick={presetTutto} disabled={!minDate}>Tutto lo storico</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="space-y-1">
          <label htmlFor="pf-op" className={label}>Operatore</label>
          <select id="pf-op" value={staffId} onChange={(e) => setStaffId(e.target.value)} className={field}>
            <option value="">Tutti</option>
            {operatori.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pf-macro" className={label}>Attività</label>
          <select id="pf-macro" value={macro} onChange={(e) => setMacro(e.target.value)} className={field}>
            <option value="">Tutte</option>
            {MACRO_ATTIVITA.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pf-comm" className={label}>Committente</label>
          <select id="pf-comm" value={committente} onChange={(e) => setCommittente(e.target.value)} className={field}>
            <option value="">Tutti</option>
            {committenti.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pf-terr" className={label}>Territorio</label>
          <select id="pf-terr" value={territorioId} onChange={(e) => setTerritorioId(e.target.value)} className={field}>
            <option value="">Tutti</option>
            {territori.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="button" onClick={apply} className="flex-1 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Applica</button>
          <button type="button" onClick={reset} className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-primary)]/10">Reset</button>
        </div>
      </div>
    </div>
  );
}
