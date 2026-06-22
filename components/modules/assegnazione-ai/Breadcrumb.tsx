'use client';

import Button from '@/components/Button';
import { breadcrumbSegments } from '@/lib/agente/aceaNav';
import type { NavState } from '@/lib/agente/aceaNav';

type BreadcrumbProps = {
  nav: NavState;
  onNavigate: (level: 'root' | 'commessa' | 'attivita') => void;
};

export function Breadcrumb({ nav, onNavigate }: BreadcrumbProps) {
  const segments = breadcrumbSegments(nav);

  if (segments.length === 0) return null;

  // determina a quale livello risale il "← Indietro"
  const backLevel: 'root' | 'commessa' | 'attivita' =
    segments.length >= 3 ? 'attivita' : segments.length === 2 ? 'commessa' : 'root';

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 flex-wrap">
      <Button
        variant="ghost"
        size="sm"
        animated={false}
        onClick={() => onNavigate(backLevel)}
        className="flex items-center gap-1"
        style={{ color: 'var(--brand-text-muted)' }}
      >
        ← Indietro
      </Button>

      <span style={{ color: 'var(--brand-text-muted)' }} className="text-xs select-none">/</span>

      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        // i=0 → cliccando "ACEA" (commessa) vogliamo mostrare AttivitaGrid → risali('commessa')
        // i=1 → cliccando "Limitazioni massive" (attività) vogliamo mostrare AzioneGrid → risali('attivita')
        const targetLevel = (['commessa', 'attivita'] as const)[i] as 'commessa' | 'attivita';
        if (isLast) {
          return (
            <span
              key={seg.key}
              className="text-xs font-medium"
              style={{ color: 'var(--brand-text-main)' }}
            >
              {seg.label}
            </span>
          );
        }
        return (
          <span key={seg.key} className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              animated={false}
              onClick={() => onNavigate(targetLevel)}
              style={{ color: 'var(--brand-text-muted)' }}
            >
              {seg.label}
            </Button>
            <span style={{ color: 'var(--brand-text-muted)' }} className="text-xs select-none">/</span>
          </span>
        );
      })}
    </nav>
  );
}
