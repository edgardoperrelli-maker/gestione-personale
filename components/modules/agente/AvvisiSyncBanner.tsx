'use client';

import { formattaIstante } from '@/lib/agente/uiTypes';

/** Banner giallo con gli avvisi salute OneDrive del PC-agente (agente_config.avvisi_sync,
 *  consegnati a ogni tick). Condiviso tra /hub/agente e /hub/assegnazione-ai: le pagine
 *  lo alimentano dai props server, quindi si aggiorna anche durante l'attesa del tick
 *  manuale (le foglie fanno router.refresh() in polling). Niente avvisi → niente banner. */
export function AvvisiSyncBanner({ avvisi, rilevatoIl }: { avvisi: string[]; rilevatoIl: string | null }) {
  if (avvisi.length === 0) return null;
  return (
    <div
      className="space-y-1 rounded-xl border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
      role="alert"
    >
      <p className="font-semibold">
        ⚠ Sincronizzazione OneDrive da controllare sul PC dell&apos;agente
        {rilevatoIl ? ` (rilevato ${formattaIstante(rilevatoIl)})` : ''}:
      </p>
      {avvisi.map((a) => (
        <p key={a}>{a}</p>
      ))}
    </div>
  );
}
