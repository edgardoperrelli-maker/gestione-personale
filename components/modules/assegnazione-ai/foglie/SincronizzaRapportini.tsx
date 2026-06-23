'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import { StoricoCard } from '@/components/modules/agente/StoricoCard';
import { useAttesaAgente } from '../useAttesaAgente';
import { BarraAttesaAgente } from '../BarraAttesaAgente';

// ─── Props ───────────────────────────────────────────────────────────────────

type SincronizzaRapportiniProps = {
  runs: AgenteRunRow[];
  online: { minutiDaContatto: number | null };
};

// ─── Componente — solo LM ─────────────────────────────────────────────────────

export function SincronizzaRapportini({ runs, online }: SincronizzaRapportiniProps) {
  const router = useRouter();
  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dispatchedAt, setDispatchedAt] = useState<number | null>(null);
  const [baselineTs, setBaselineTs] = useState<string | null>(null);

  const runsSync = runs.filter((r) => r.tipo === 'sync' || !r.tipo);
  const fatto = dispatchedAt != null && runsSync.some((r) => !baselineTs || r.creato_il > baselineTs);
  const inAttesa = dispatchedAt != null && !fatto;

  useAttesaAgente({ inAttesa: dispatchedAt != null, fatto, onPoll: () => router.refresh() });

  async function eseguiOra() {
    setArming(true); setMsg(null);
    const baseline = runsSync[0]?.creato_il ?? null;
    try {
      const res = await fetch('/api/admin/agente/esegui-ora', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setBaselineTs(baseline);
        setDispatchedAt(Date.now());
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

  return (
    <div className="space-y-4">
      <Card animated={false}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            Sincronizza rapportini
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
          Avvia un giro dell&rsquo;agente locale per sincronizzare i rapportini delle Limitazioni Massive con il file SharePoint.
          Il giro parte al prossimo contatto dell&rsquo;agente (entro ~1 min).
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => void eseguiOra()}
            disabled={arming || inAttesa}
          >
            {arming ? 'Invio…' : inAttesa ? 'In attesa…' : 'Esegui ora'}
          </Button>

          <Link
            href="/hub/agente"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition px-3 py-1.5 text-xs text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
          >
            Configura colonne in Agente
          </Link>
        </div>

        {msg && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>
        )}

        <BarraAttesaAgente dispatchedAt={dispatchedAt} fatto={fatto} etichetta="Sincronizza rapportini" />
      </CardContent>
      </Card>

      <StoricoCard runs={runsSync} />
    </div>
  );
}
