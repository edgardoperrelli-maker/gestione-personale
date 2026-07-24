'use client';

import { RefreshCw, ListChecks, RotateCw, ChevronRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/Card';
import { AZIONE_LABEL } from '@/lib/agente/aceaNav';

type AzioneGridProps = {
  commessa: string;
  attivita: string;
  onSelect: (azione: string) => void;
};

const DESCRIZIONI: Record<string, string> = {
  'aggiorna-odl': 'Aggiorna lo stato ODL leggendolo dal portale ACEA.',
  'aggiorna-stato': 'Aggiorna lo stato ODL dal portale ACEA e riporta le sostituzioni saracinesca dai rapportini.',
  assegna: 'Leggi il file per un giorno e assegna gli interventi (app + ACEA).',
  'assegna-interventi': 'Leggi il file per un giorno e assegna gli interventi (app + ACEA).',
  sincronizza: 'Scrivi gli esiti dei rapportini sul file.',
};

const ICONE: Record<string, LucideIcon> = {
  'aggiorna-odl': RefreshCw,
  'aggiorna-stato': RefreshCw,
  assegna: ListChecks,
  'assegna-interventi': ListChecks,
  sincronizza: RotateCw,
};

const AZIONI_PER_ATTIVITA: Record<string, string[]> = {
  lm: ['aggiorna-odl', 'assegna', 'sincronizza'],
  dunning: ['aggiorna-stato', 'assegna-interventi'],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AzioneGrid({ commessa: _commessa, attivita, onSelect }: AzioneGridProps) {
  const azioni = AZIONI_PER_ATTIVITA[attivita] ?? [];

  if (azioni.length === 0) {
    return <p className="text-sm text-[var(--brand-text-muted)]">Nessuna azione disponibile per questa attività.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {azioni.map((az) => {
        const Icona = ICONE[az] ?? ListChecks;
        return (
          <Card
            key={az}
            interactive
            role="button"
            tabIndex={0}
            onClick={() => onSelect(az)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(az); } }}
            className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            <CardContent>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]">
                  <Icona size={18} strokeWidth={1.6} aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-base font-semibold text-[var(--brand-text-main)]">{AZIONE_LABEL[az] ?? az}</span>
                  <p className="text-sm text-[var(--brand-text-muted)]">{DESCRIZIONI[az] ?? ''}</p>
                </div>
                <ChevronRight size={18} className="mt-1 shrink-0 text-[var(--brand-text-subtle)] transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
