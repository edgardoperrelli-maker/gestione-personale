'use client';

import { Building2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/Card';
import Badge from '@/components/Badge';

type CommessaGridProps = {
  onSelect: (commessa: string) => void;
};

type CommessaItem = {
  key: string;
  label: string;
  descrizione: string;
  disabled?: boolean;
};

const COMMESSE: CommessaItem[] = [
  { key: 'acea', label: 'ACEA', descrizione: 'Interventi e ODL della commessa ACEA.' },
  { key: 'italgas', label: 'Italgas', descrizione: 'Interventi e ODL della commessa Italgas.', disabled: true },
  { key: 'areti', label: 'Areti', descrizione: 'Interventi e ODL della commessa Areti.', disabled: true },
];

/** Chip-icona coerente coi tre livelli del drill-down (era presente solo qui). */
function ChipIcona({ muted = false }: { muted?: boolean }) {
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] ${
        muted ? 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-subtle)]' : 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
      }`}
    >
      <Building2 size={18} strokeWidth={1.6} aria-hidden />
    </span>
  );
}

export function CommessaGrid({ onSelect }: CommessaGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {COMMESSE.map((c) =>
        c.disabled ? (
          <div
            key={c.key}
            aria-disabled="true"
            className="cursor-not-allowed rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 opacity-60 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start gap-3">
              <ChipIcona muted />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[var(--brand-text-main)]">{c.label}</span>
                  <Badge variant="muted">in arrivo</Badge>
                </div>
                <p className="text-sm text-[var(--brand-text-muted)]">{c.descrizione}</p>
              </div>
            </div>
          </div>
        ) : (
          <Card
            key={c.key}
            interactive
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.key); }
            }}
            className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            <CardContent>
              <div className="flex items-start gap-3">
                <ChipIcona />
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-base font-semibold text-[var(--brand-text-main)]">{c.label}</span>
                  <p className="text-sm text-[var(--brand-text-muted)]">{c.descrizione}</p>
                </div>
                <ChevronRight
                  size={18}
                  className="mt-1 shrink-0 text-[var(--brand-text-subtle)] transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
