'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import type { NavState } from '@/lib/agente/aceaNav';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import { opzioniComuneGiro, etichettaComune, TARGET_DUNNING, TARGET_TUTTI, type FileMaster } from '@/lib/agente/comuni';
import { StoricoCard } from '@/components/modules/agente/StoricoCard';
import { useAttesaAgente } from '../useAttesaAgente';
import { BarraAttesaAgente } from '../BarraAttesaAgente';
import { ConfrontoEsitiAcea } from './ConfrontoEsitiAcea';

// ─── Props ───────────────────────────────────────────────────────────────────

type AggiornaStatoOdlProps = {
  nav: NavState;
  runs: AgenteRunRow[];
  filesMaster: FileMaster[];
  online: { minutiDaContatto: number | null };
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function AggiornaStatoOdl({ nav, runs, filesMaster, online }: AggiornaStatoOdlProps) {
  // Limitazioni massive → si sceglie il comune (il comune È il nome del file master:
  // LABICO.xlsx → LABICO); qualunque altra attività → il master DUNNING, come da sempre.
  const isLm = nav.attivita === 'lm';
  // Solo il giro DUNNING riporta anche le sostituzioni saracinesca dai rapportini
  // (sulle massive la saracinesca arriva dal giro cartella, non da questo bottone).
  const isDunning = !isLm;
  const router = useRouter();

  const opzioni = useMemo(() => opzioniComuneGiro(filesMaster), [filesMaster]);
  const [comune, setComune] = useState<string>(TARGET_TUTTI);
  const target = isLm ? comune : TARGET_DUNNING;

  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dispatchedAt, setDispatchedAt] = useState<number | null>(null);
  const [baselineTs, setBaselineTs] = useState<string | null>(null);

  const runsStato = runs.filter((r) => r.tipo === 'acea-stato');
  // fatto = è arrivato un giro 'acea-stato' più recente del baseline registrato al click
  const fatto = dispatchedAt != null && runsStato.some((r) => !baselineTs || r.creato_il > baselineTs);
  const inAttesa = dispatchedAt != null && !fatto;

  // polling finché l'agente non ha fatto il giro (router.refresh ricarica i runs dal server)
  useAttesaAgente({ inAttesa: dispatchedAt != null, fatto, onPoll: () => router.refresh() });

  async function aggiornaStatoAcea() {
    setArming(true); setMsg(null);
    const baseline = runsStato[0]?.creato_il ?? null; // runs ordinati per creato_il desc
    try {
      const res = await fetch('/api/admin/agente/acea-stato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
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
            {isDunning ? 'Aggiorna stato/rapportino' : 'Aggiorna stato ODL da ACEA'}
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
          {isDunning ? (
            <>
              Richiede all&rsquo;agente locale di aggiornare lo stato degli ODL sul portale ACEA e di
              riportare le sostituzioni saracinesca registrate nei rapportini. L&rsquo;operazione parte al
              prossimo contatto dell&rsquo;agente.
            </>
          ) : (
            <>
              Richiede all&rsquo;agente locale di aggiornare lo stato degli ODL sul portale ACEA, riversandolo
              sul file master del comune scelto{' '}
              <strong>{comune === TARGET_TUTTI ? '(tutti i comuni)' : `(${etichettaComune(comune)})`}</strong>.
              L&rsquo;operazione parte al prossimo contatto dell&rsquo;agente. Con &ldquo;Tutti i comuni&rdquo;
              l&rsquo;export da ACEA resta uno solo e viene riversato su ogni file.
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {isLm && (
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              Comune
              <select
                value={comune}
                onChange={(e) => setComune(e.target.value)}
                disabled={arming || inAttesa}
                className="rounded-lg border px-2 py-1.5 text-sm disabled:opacity-60"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
                title="Quale file master aggiornare con lo stato ODL preso da ACEA."
              >
                {opzioni.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          <Button
            variant="primary"
            onClick={() => void aggiornaStatoAcea()}
            disabled={arming || inAttesa}
          >
            {arming ? 'Invio…' : inAttesa ? 'In attesa…' : isDunning ? 'Esegui ora' : 'Aggiorna stato ODL da ACEA'}
          </Button>
        </div>

        {msg && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>
        )}

        <BarraAttesaAgente
          dispatchedAt={dispatchedAt}
          fatto={fatto}
          etichetta={isDunning ? 'Aggiorna stato/rapportino' : 'Aggiorna stato ODL'}
        />
      </CardContent>
      </Card>

      {/* Controllo esiti DB ↔ ACEA: si ricalcola da solo quando arriva un nuovo giro acea-stato. */}
      <ConfrontoEsitiAcea ultimoGiroTs={runsStato[0]?.creato_il ?? null} />

      <StoricoCard runs={runsStato} />
    </div>
  );
}
