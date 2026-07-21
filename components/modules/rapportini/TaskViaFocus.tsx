'use client';

import { useCallback, useEffect, useState } from 'react';
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
        <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--brand-text-muted)]">&larr; Indietro</button>
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Bonifiche extra</span>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Via</p>
        <p className="text-lg font-bold text-[var(--brand-text-main)]">{voce.via ?? '—'}</p>
      </div>

      <button
        type="button"
        onClick={() => onAggiungi(voce)}
        className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[var(--on-primary)]"
      >
        + Aggiungi intervento
      </button>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Interventi su questa via ({interventi.length})</p>
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
