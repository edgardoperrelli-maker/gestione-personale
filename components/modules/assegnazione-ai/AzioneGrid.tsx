'use client';

import { Card, CardContent } from '@/components/Card';
import { AZIONE_LABEL } from '@/lib/agente/aceaNav';

type AzioneGridProps = {
  commessa: string;
  attivita: string;
  onSelect: (azione: string) => void;
};

const DESCRIZIONI: Record<string, string> = {
  'aggiorna-odl': 'Aggiorna lo stato ODL leggendolo dal portale ACEA.',
  'aggiorna-stato': 'Aggiorna lo stato ODL leggendolo dal portale ACEA.',
  assegna: 'Leggi il file per un giorno e assegna gli interventi (app + ACEA).',
  'assegna-interventi': 'Leggi il file per un giorno e assegna gli interventi (app + ACEA).',
  sincronizza: 'Scrivi gli esiti dei rapportini sul file.',
};

const AZIONI_PER_ATTIVITA: Record<string, string[]> = {
  lm: ['aggiorna-odl', 'assegna', 'sincronizza'],
  dunning: ['aggiorna-stato', 'assegna-interventi'],
};

export function AzioneGrid({ commessa: _commessa, attivita, onSelect }: AzioneGridProps) {
  const azioni = AZIONI_PER_ATTIVITA[attivita] ?? [];

  if (azioni.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
        Nessuna azione disponibile per questa attività.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {azioni.map((az) => (
        <Card
          key={az}
          interactive
          role="button"
          tabIndex={0}
          onClick={() => onSelect(az)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(az);
            }
          }}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          <CardContent className="space-y-2">
            <span
              className="text-base font-semibold"
              style={{ color: 'var(--brand-text-main)' }}
            >
              {AZIONE_LABEL[az] ?? az}
            </span>
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              {DESCRIZIONI[az] ?? ''}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
