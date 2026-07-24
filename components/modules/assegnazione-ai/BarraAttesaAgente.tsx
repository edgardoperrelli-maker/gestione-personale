'use client';

import { useState, useEffect } from 'react';
import { TriangleAlert, RotateCw } from 'lucide-react';
import { statoAttesa } from '@/lib/agente/attesaAgente';

// Barra "In attesa dell'agente" per chi lancia una richiesta che passa dal tick.
// `dispatchedAt` = istante del click (null = nessuna richiesta pendente). `fatto` = risultato arrivato.
// `sogliaStalloMin` = null per azioni lunghe (es. Assegna su ACEA) → nessun falso allarme.
export function BarraAttesaAgente({
  dispatchedAt,
  fatto,
  sogliaStalloMin = 12,
  etichetta = 'Operazione',
}: {
  dispatchedAt: number | null;
  fatto: boolean;
  sogliaStalloMin?: number | null;
  etichetta?: string;
}) {
  const inAttesa = dispatchedAt != null && !fatto;
  const [oraTick, setOraTick] = useState(() => Date.now());

  // avanza l'orologio ogni 20s mentre si attende, per ricalcolare i minuti / la soglia
  useEffect(() => {
    if (!inAttesa) return;
    const id = setInterval(() => setOraTick(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [inAttesa]);

  const { stato, minuti } = statoAttesa(inAttesa, dispatchedAt, oraTick, sogliaStalloMin);
  if (stato === 'idle') return null;

  const ora = dispatchedAt
    ? new Date(dispatchedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (stato === 'stallo') {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
      >
        <TriangleAlert size={15} className="shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
        <span>{etichetta}: ci sta mettendo più del previsto (<span className="font-mono tabular-nums">{minuti}</span>+ min). Controlla qui sotto o riprova.</span>
      </div>
    );
  }

  return (
    <div
      className="space-y-2 rounded-[var(--radius-lg)] border px-3 py-2.5"
      style={{ borderColor: 'var(--status-progress)', backgroundColor: 'var(--status-progress-soft)' }}
    >
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
        <RotateCw size={14} className="animate-spin" style={{ color: 'var(--status-progress)' }} aria-hidden />
        <span>
          {etichetta} — in attesa dell&rsquo;agente…
          <span className="font-normal" style={{ color: 'var(--brand-text-muted)' }}>
            {' '}(parte entro ~1 min{ora ? <> · da <span className="font-mono tabular-nums">{ora}</span></> : ''})
          </span>
        </span>
      </div>
      <div className="barra-indeterminata h-1.5 w-full" style={{ backgroundColor: 'var(--brand-surface-muted)' }} aria-hidden />
    </div>
  );
}
