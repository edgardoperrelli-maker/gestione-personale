'use client';

import { Card, CardContent } from '@/components/Card';
import { ATTIVITA_LABEL } from '@/lib/agente/aceaNav';

type AttivitaGridProps = {
  commessa: string;
  onSelect: (attivita: string) => void;
};

type AttivitaItem = {
  key: string;
  descrizione: string;
};

const ATTIVITA_ACEA: AttivitaItem[] = [
  {
    key: 'lm',
    descrizione: 'Operazioni di limitazione massiva: aggiorna ODL, assegna e sincronizza.',
  },
  {
    key: 'dunning',
    descrizione: 'Operazioni dunning: aggiorna lo stato ODL e assegna interventi.',
  },
];

const ATTIVITA_PER_COMMESSA: Record<string, AttivitaItem[]> = {
  acea: ATTIVITA_ACEA,
};

export function AttivitaGrid({ commessa, onSelect }: AttivitaGridProps) {
  const attivita = ATTIVITA_PER_COMMESSA[commessa] ?? [];

  if (attivita.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
        Nessuna attività disponibile per questa commessa.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {attivita.map((a) => (
        <Card
          key={a.key}
          interactive
          role="button"
          tabIndex={0}
          onClick={() => onSelect(a.key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(a.key);
            }
          }}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          <CardContent className="space-y-2">
            <span
              className="text-base font-semibold"
              style={{ color: 'var(--brand-text-main)' }}
            >
              {ATTIVITA_LABEL[a.key] ?? a.key}
            </span>
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              {a.descrizione}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
