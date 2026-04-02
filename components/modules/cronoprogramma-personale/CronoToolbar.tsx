'use client';
import Button from '@/components/Button';
import Tabs from '@/components/Tabs';
import type { PlannerView, SortMode, ViewMode } from './types';

export default function CronoToolbar({
  title,
  mode,
  plannerView,
  sortMode,
  filtersCount,
  onPrev,
  onNext,
  onToday,
  onModeChange,
  onPlannerViewChange,
  onSortModeChange,
  onToggleFilters,
  onInsertRep,
  onExport,
}: {
  title: string;
  mode: ViewMode;
  plannerView: PlannerView;
  sortMode: SortMode;
  filtersCount: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onModeChange: (m: ViewMode) => void;
  onPlannerViewChange: (v: PlannerView) => void;
  onSortModeChange: (m: SortMode) => void;
  onToggleFilters: () => void;
  onInsertRep: () => void;
  onExport: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Button onClick={onPrev} size="sm">
            {'<'}
          </Button>
          <div className="text-lg font-semibold tracking-tight">{title}</div>
          <Button onClick={onNext} size="sm">
            {'>'}
          </Button>
        </div>

        <div className="inline-flex rounded-xl border border-[var(--brand-border)] bg-white shadow-sm">
          <button
            type="button"
            onClick={() => onModeChange('week')}
            className={`px-3 py-1.5 text-sm ${
              mode === 'week'
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-[var(--brand-text-muted)] hover:bg-[var(--brand-nav-active-bg)]'
            }`}
          >
            Settimana
          </button>
          <button
            type="button"
            onClick={() => onModeChange('twoWeeks')}
            className={`px-3 py-1.5 text-sm ${
              mode === 'twoWeeks'
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-[var(--brand-text-muted)] hover:bg-[var(--brand-nav-active-bg)]'
            }`}
          >
            2 settimane
          </button>
          <button
            type="button"
            onClick={() => onModeChange('month')}
            className={`px-3 py-1.5 text-sm ${
              mode === 'month'
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-[var(--brand-text-muted)] hover:bg-[var(--brand-nav-active-bg)]'
            }`}
          >
            Mese
          </button>
        </div>

        <Button onClick={onToday} variant="soft" size="sm">
          Oggi
        </Button>

        <Tabs
          value={plannerView}
          onValueChange={(v) => onPlannerViewChange(v as PlannerView)}
          items={[
            { value: 'grid', label: 'Vista griglia' },
            { value: 'split', label: 'Split' },
            { value: 'calendar', label: 'Calendario' },
            { value: 'table', label: 'Tabella' },
          ]}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={onInsertRep} size="sm">
            Inserisci reperibile
          </Button>
          <Button onClick={onExport} variant="outline" size="sm">
            Esporta
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button onClick={onToggleFilters} variant="outline" size="sm">
          Filtri {filtersCount ? `(${filtersCount})` : ''}
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--brand-text-muted)]">Ordina</span>
          <select
            className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1.5 text-sm"
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as SortMode)}
          >
            <option value="AZ">A - Z</option>
            <option value="REPERIBILE">Reperibile</option>
            <option value="ATTIVITA">Attivita</option>
            <option value="TERRITORIO">Territorio</option>
            <option value="SENZA_ATTIVITA">Senza attivita</option>
            <option value="PER_TERRITORIO">Per territorio</option>
          </select>
        </div>
      </div>
    </div>
  );
}
