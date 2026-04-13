'use client';
import Button from '@/components/Button';
import Tabs from '@/components/Tabs';
import type { PlannerView } from './types';

export default function CronoToolbar({
  title,
  plannerView,
  reperibili,
  onPrev,
  onNext,
  onToday,
  onPlannerViewChange,
  onInsertRep,
  onNewAppointment,
  onExport,
}: {
  title: string;
  plannerView: PlannerView;
  reperibili: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPlannerViewChange: (v: PlannerView) => void;
  onInsertRep: () => void;
  onNewAppointment: () => void;
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
          {/* Reperibili nel range — spostato qui dalle stat card */}
          {reperibili > 0 && (
            <span className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-1.5 text-sm">
              <span className="text-[var(--brand-text-muted)]">Reperibili </span>
              <span className="font-semibold text-[var(--brand-primary)]">{reperibili}</span>
            </span>
          )}
          <Button onClick={onInsertRep} size="sm">
            Inserisci reperibile
          </Button>
          <Button onClick={onNewAppointment} size="sm" variant="soft">
            + Appuntamento
          </Button>
          <Button onClick={onExport} variant="outline" size="sm">
            Esporta
          </Button>
        </div>
      </div>
    </div>
  );
}
