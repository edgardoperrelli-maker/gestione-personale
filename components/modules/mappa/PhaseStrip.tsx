import React from 'react';
import { PLANNING_PHASES, type PlanningPhase } from '@/lib/mappa/planningPhase';

/**
 * Striscia di fasi: spunta le fasi fatte, evidenzia la corrente, attenua le
 * future (che restano comunque visibili). Puramente presentazionale.
 */
export default function PhaseStrip({ current }: { current: PlanningPhase }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 shadow-sm" role="group" aria-label="Fasi della pianificazione">
      {PLANNING_PHASES.map((p, i) => {
        const done = p.id < current;
        const active = p.id === current;
        return (
          <React.Fragment key={p.key}>
            {i > 0 && (
              <div
                className={`h-px min-w-[6px] flex-1 ${
                  p.id <= current ? 'bg-[var(--brand-primary)]/40' : 'bg-[var(--brand-border)]'
                }`}
                aria-hidden="true"
              />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                active
                  ? 'border-2 border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                  : done
                    ? 'bg-[var(--success-soft)] text-[var(--success)]'
                    : 'text-[var(--brand-text-subtle)]'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                <span aria-hidden="true">{done ? '✓' : p.id}</span>
                <span className="sr-only">{done ? 'Completato' : `Fase ${p.id}`}</span>
              </span>
              <span>{p.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
