'use client';
import { COST_CENTERS } from '@/constants/cost-centers';
import type { Activity, Staff, Territory } from '@/types';
import type { FilterToken } from './types';

export default function CronoFiltersPanel({
  open,
  filters,
  staff,
  activities,
  territories,
  onToggle,
  onClear,
}: {
  open: boolean;
  filters: FilterToken[];
  staff: Staff[];
  activities: Activity[];
  territories: Territory[];
  onToggle: (token: string) => void;
  onClear: () => void;
}) {
  if (!open) return null;

  return (
    <div className="mt-3 rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Filtri</div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
        >
          Azzera
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Reperibilita
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={filters.includes('REPERIBILE')} onChange={() => onToggle('REPERIBILE')} />
            Solo reperibili
          </label>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Centri di costo
          </div>
          <div className="flex flex-wrap gap-2">
            {COST_CENTERS.map((cc) => {
              const token = `CC:${cc}`;
              const checked = filters.includes(token);
              return (
                <label key={cc} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <input type="checkbox" checked={checked} onChange={() => onToggle(token)} />
                  {cc}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Operatori
          </div>
          <div className="flex max-h-40 flex-col gap-1 overflow-auto pr-1 text-sm">
            {staff.map((s) => {
              const token = `STAFF:${s.id}`;
              return (
                <label key={s.id} className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={filters.includes(token)} onChange={() => onToggle(token)} />
                  {s.display_name}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Attivita
          </div>
          <div className="flex max-h-40 flex-col gap-1 overflow-auto pr-1 text-sm">
            {activities.map((a) => {
              const token = `ACT:${a.id}`;
              return (
                <label key={a.id} className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={filters.includes(token)} onChange={() => onToggle(token)} />
                  {a.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Territori
          </div>
          <div className="flex flex-wrap gap-2">
            {territories.map((t) => {
              const token = `TERR:${t.id}`;
              const checked = filters.includes(token);
              return (
                <label key={t.id} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <input type="checkbox" checked={checked} onChange={() => onToggle(token)} />
                  {t.name}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
