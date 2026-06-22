'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import type { NavState } from '@/lib/agente/aceaNav';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import { StoricoCard } from '@/components/modules/agente/StoricoCard';
import { usePollRuns } from '../usePollRuns';

// ─── Props ───────────────────────────────────────────────────────────────────

type AggiornaStatoOdlProps = {
  nav: NavState;
  runs: AgenteRunRow[];
  online: { minutiDaContatto: number | null };
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function AggiornaStatoOdl({ nav, runs, online }: AggiornaStatoOdlProps) {
  // target: lm → zagarolo, dunning → dunning
  const target = nav.attivita === 'lm' ? 'zagarolo' : 'dunning';

  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pollAttivo, setPollAttivo] = useState(false);

  // auto-refresh storico dopo l'invio
  usePollRuns(() => { /* router.refresh() già chiamato dall'hook */ }, pollAttivo);

  async function aggiornaStatoAcea() {
    setArming(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-stato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg('Richiesta inviata: parte al prossimo contatto dell\'agente.');
        setPollAttivo(false);   // reset → riattiviamo subito per far scattare i timer
        setTimeout(() => setPollAttivo(true), 0);
      } else {
        setMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
      }
    } catch (e) {
      setMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setArming(false);
    }
  }

  // Spia online
  const minuti = online.minutiDaContatto;
  const isOnline = minuti !== null && minuti <= 2;
  const spiaColore = isOnline ? 'var(--status-ok)' : 'var(--status-idle)';
  const spiaLabel = isOnline
    ? 'Online'
    : minuti === null
      ? 'Offline · mai visto'
      : `Offline · ${minuti} min fa`;

  const runsStato = runs.filter((r) => r.tipo === 'acea-stato');

  return (
    <div className="space-y-4">
      <Card animated={false}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            Aggiorna stato ODL da ACEA
          </h2>
          {/* Spia online */}
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: spiaColore }}>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: spiaColore }}
              aria-hidden="true"
            />
            {spiaLabel}
          </span>
        </div>

        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Richiede all&rsquo;agente locale di aggiornare lo stato degli ODL sul portale ACEA (target:{' '}
          <strong>{target}</strong>). L&rsquo;operazione parte al prossimo contatto dell&rsquo;agente.
        </p>

        <Button
          variant="primary"
          onClick={() => void aggiornaStatoAcea()}
          disabled={arming}
        >
          {arming ? 'Invio…' : 'Aggiorna stato ODL da ACEA'}
        </Button>

        {msg && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>
        )}
      </CardContent>
      </Card>

      <StoricoCard runs={runsStato} />
    </div>
  );
}
