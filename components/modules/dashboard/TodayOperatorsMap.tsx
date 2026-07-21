'use client';

/**
 * TodayOperatorsMap — mappa "Operatori di oggi" della dashboard.
 *
 * Migrata da Leaflet a **mapcn** (MapLibre GL): adapter che trasforma gli
 * operatori in punti e delega il rendering a `OperatorsMap`. Caricato via
 * `next/dynamic(..., { ssr: false })` da `DashboardTodayMap`.
 *
 * (Sostituisce il precedente `TodayMapLeaflet.tsx`.)
 */

import { useMemo } from 'react';
import OperatorsMap, { type OperatorsMapPoint } from '@/components/modules/mappa/OperatorsMap';
import type { TodayOperatorMarker } from '@/lib/dashboard/todayOperators';

export default function TodayOperatorsMap({ operators }: { operators: TodayOperatorMarker[] }) {
  const points = useMemo<OperatorsMapPoint[]>(
    () =>
      operators.map((op) => ({
        id: op.staffId,
        lat: op.lat,
        lng: op.lng,
        color: 'var(--status-progress)',
        fillColor: 'var(--brand-primary-soft)',
        size: 16,
        weight: 2,
        fillOpacity: 0.85,
        popup: (
          <span>
            <strong>{op.name}</strong>
            {op.territory ? (
              <>
                <br />
                {op.territory}
              </>
            ) : null}
          </span>
        ),
      })),
    [operators],
  );

  return (
    <OperatorsMap points={points} scrollZoom={false} singlePointZoom={12} maxZoom={13} />
  );
}
