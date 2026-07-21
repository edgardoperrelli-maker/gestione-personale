'use client';

/**
 * TorreMappa — mappa live degli interventi (torre di controllo).
 *
 * Migrata da Leaflet a **mapcn** (MapLibre GL): ora è un semplice adapter che
 * trasforma gli interventi in punti e delega il rendering a `OperatorsMap`.
 * Il componente è già caricato via `next/dynamic(..., { ssr: false })` in
 * `LiveClient`, quindi l'import statico di OperatorsMap (WebGL) è SSR-safe.
 */

import { useMemo } from 'react';
import OperatorsMap, { type OperatorsMapPoint } from '@/components/modules/mappa/OperatorsMap';
import { coloreStato, type TonoTorre } from '@/lib/interventi/torreView';
import type { TorreIntervento } from './LiveClient';

// Mappa tono → token colore. Con i marker DOM di mapcn si passa direttamente
// `var(--token)`, senza più risolvere con getComputedStyle (come serviva a Leaflet).
const DOT_TOKEN: Record<TonoTorre, string> = {
  ok: '--status-ok',
  ko: '--status-ko',
  attesa: '--status-warn',
  corso: '--status-progress',
  annullato: '--status-idle',
  da_assegnare: '--status-idle',
};

export default function TorreMappa({ interventi }: { interventi: TorreIntervento[] }) {
  const points = useMemo<OperatorsMapPoint[]>(
    () =>
      interventi
        .filter((it) => it.lat != null && it.lng != null)
        .map((it) => {
          const color = `var(${DOT_TOKEN[coloreStato(it.stato, it.esito)]})`;
          return {
            id: it.id,
            lat: it.lat as number,
            lng: it.lng as number,
            color,
            size: 14,
            weight: 1,
            fillOpacity: 0.85,
            popup: (
              <span>
                {it.nominativo ?? it.odl ?? 'Intervento'}
                {it.comune ? ` · ${it.comune}` : ''}
              </span>
            ),
          };
        }),
    [interventi],
  );

  return (
    <div
      className="h-[420px] w-full overflow-hidden rounded-2xl border"
      style={{ borderColor: 'var(--brand-border)' }}
    >
      <OperatorsMap points={points} maxZoom={14} fitPadding={30} />
    </div>
  );
}
