'use client';

import { ClipboardList, CircleAlert, ChevronRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/Card';
import { ATTIVITA_LABEL } from '@/lib/agente/aceaNav';

type AttivitaGridProps = {
  commessa: string;
  onSelect: (attivita: string) => void;
};

type AttivitaItem = { key: string; descrizione: string; icona: LucideIcon };

const ATTIVITA_ACEA: AttivitaItem[] = [
  { key: 'lm', descrizione: 'Limitazioni massive: aggiorna ODL, assegna e sincronizza.', icona: ClipboardList },
  { key: 'dunning', descrizione: 'Dunning: aggiorna lo stato ODL e assegna interventi.', icona: CircleAlert },
];

const ATTIVITA_PER_COMMESSA: Record<string, AttivitaItem[]> = { acea: ATTIVITA_ACEA };

export function AttivitaGrid({ commessa, onSelect }: AttivitaGridProps) {
  const attivita = ATTIVITA_PER_COMMESSA[commessa] ?? [];

  if (attivita.length === 0) {
    return <p className="text-sm text-[var(--brand-text-muted)]">Nessuna attività disponibile per questa commessa.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {attivita.map((a) => {
        const Icona = a.icona;
        return (
          <Card
            key={a.key}
            interactive
            role="button"
            tabIndex={0}
            onClick={() => onSelect(a.key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(a.key); } }}
            className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            <CardContent>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]">
                  <Icona size={18} strokeWidth={1.6} aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-base font-semibold text-[var(--brand-text-main)]">{ATTIVITA_LABEL[a.key] ?? a.key}</span>
                  <p className="text-sm text-[var(--brand-text-muted)]">{a.descrizione}</p>
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
