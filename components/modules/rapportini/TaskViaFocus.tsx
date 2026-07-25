/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import Button from '@/components/Button';
import type { Voce } from './RapportinoForm';

const STATO_LABEL: Record<string, string> = {
  in_attesa: 'In sospeso', approvato: 'Approvato', rifiutato: 'Rifiutato',
  auto_liberi: 'Approvato', annullato: 'Annullato',
};

export function TaskViaFocus({
  voce,
  token,
  onAggiungi,
  onClose,
}: {
  voce: Voce;
  token: string;
  onAggiungi: (voce: Voce) => void;
  onClose: () => void;
}) {
  const [interventi, setInterventi] = useState<Array<{ id: string; stato: string; matricola: string }>>([]);
  const parentId = voce.taskId ?? voce.id;
  const carica = useCallback(async () => {
    try {
      const r = await fetch(`/api/r/${token}/task-via/${parentId}`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { interventi: [] }) as { interventi?: Array<{ id: string; stato: string; matricola: string }> };
      setInterventi(j.interventi ?? []);
    } catch { /* lista best-effort */ }
  }, [token, parentId]);
  useEffect(() => { void carica(); }, [carica]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="-ml-1 inline-flex min-h-[48px] items-center gap-1.5 rounded-[var(--radius-md)] px-1 text-sm font-semibold text-[var(--brand-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
          <ChevronLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          Indietro
        </button>
        <span className="text-xs font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">Bonifiche extra</span>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">Via</p>
        <p className="text-lg font-semibold text-[var(--brand-text-main)]">{voce.via ?? '—'}</p>
      </div>

      <Button variant="primary" size="touch" onClick={() => onAggiungi(voce)} className="w-full">
        <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Aggiungi intervento
      </Button>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">Interventi su questa via ({interventi.length})</p>
        {interventi.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun intervento creato per ora.</p>
        ) : (
          <ul className="divide-y divide-[var(--brand-border)] rounded-xl border border-[var(--brand-border)]">
            {interventi.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium text-[var(--brand-text-main)]">{i.matricola || '(senza matricola)'}</span>
                <span className="shrink-0 text-xs text-[var(--brand-text-muted)]">{STATO_LABEL[i.stato] ?? i.stato}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}