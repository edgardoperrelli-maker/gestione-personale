'use client';

import { Card, CardContent } from '@/components/Card';
import Badge from '@/components/Badge';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';

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
  {
    key: 'acea',
    label: 'ACEA',
    descrizione: 'Gestione interventi e ODL per la commessa ACEA.',
  },
  {
    key: 'italgas',
    label: 'Italgas',
    descrizione: 'Gestione interventi e ODL per la commessa Italgas.',
    disabled: true,
  },
  {
    key: 'areti',
    label: 'Areti',
    descrizione: 'Gestione interventi e ODL per la commessa Areti.',
    disabled: true,
  },
];

export function CommessaGrid({ onSelect }: CommessaGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {COMMESSE.map((c) =>
        c.disabled ? (
          <div
            key={c.key}
            aria-disabled="true"
            className="rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] opacity-50 cursor-not-allowed"
          >
            <div className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--brand-text-muted)' }}>
                    {MODULE_ICONS['assegnazione-ai']}
                  </span>
                  <span
                    className="text-base font-semibold"
                    style={{ color: 'var(--brand-text-main)' }}
                  >
                    {c.label}
                  </span>
                </div>
                <Badge variant="muted">in arrivo</Badge>
              </div>
              <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                {c.descrizione}
              </p>
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
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(c.key);
              }
            }}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--brand-primary)' }}>
                  {MODULE_ICONS['assegnazione-ai']}
                </span>
                <span
                  className="text-base font-semibold"
                  style={{ color: 'var(--brand-text-main)' }}
                >
                  {c.label}
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                {c.descrizione}
              </p>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
