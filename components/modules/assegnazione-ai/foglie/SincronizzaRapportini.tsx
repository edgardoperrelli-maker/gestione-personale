'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import { StoricoCard } from '@/components/modules/agente/StoricoCard';
import { usePollRuns } from '../usePollRuns';

// ─── Props ───────────────────────────────────────────────────────────────────

type SincronizzaRapportiniProps = {
  runs: AgenteRunRow[];
  online: { minutiDaContatto: number | null };
};

// ─── Componente — solo LM ─────────────────────────────────────────────────────

export function SincronizzaRapportini({ runs, online }: SincronizzaRapportiniProps) {
  const card = { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' } as const;

  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pollAttivo, setPollAttivo] = useState(false);

  // auto-refresh storico dopo "Esegui ora"
  usePollRuns(() => { /* router.refresh() già eseguito dall'hook */ }, pollAttivo);

  async function eseguiOra() {
    setArming(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/agente/esegui-ora', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg('Giro armato: parte al prossimo contatto dell\'agente (entro l\'ora).');
        setPollAttivo(false);
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

  const runsSync = runs.filter((r) => r.tipo === 'sync' || !r.tipo);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border p-5 space-y-4" style={card}>
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
          Avvia un giro dell'agente locale per sincronizzare i rapportini delle Limitazioni Massive con il file SharePoint.
          Il giro parte al prossimo contatto dell'agente (entro ~1 min).
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void eseguiOra()}
            disabled={arming}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--on-primary)' }}
          >
            {arming ? 'Invio…' : 'Esegui ora'}
          </button>

          <Link
            href="/hub/agente"
            className="rounded-xl border px-4 py-2 text-sm font-medium transition"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            Configura colonne in Agente
          </Link>
        </div>

        {msg && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>
        )}
      </section>

      <StoricoCard runs={runsSync} />
    </div>
  );
}
