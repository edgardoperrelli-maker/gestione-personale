export type TodayAssignmentRow = {
  staffId: string;
  displayName: string;
  territoryName: string | null;
  lat: number | null;
  lng: number | null;
};

export type TodayOperatorMarker = {
  staffId: string;
  name: string;
  territory: string | null;
  lat: number;
  lng: number;
};

/**
 * Da un elenco di assegnazioni del giorno (già filtrate per validità staff/data),
 * produce i marker operatore da mostrare sulla mappa di oggi:
 * - un marker per operatore (deduplica per staffId, prima occorrenza),
 * - solo operatori con coordinate valide.
 */
export function selectTodayOperators(rows: TodayAssignmentRow[]): TodayOperatorMarker[] {
  const seen = new Set<string>();
  const markers: TodayOperatorMarker[] = [];

  for (const r of rows) {
    if (!r.staffId || seen.has(r.staffId)) continue;
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    if (Number.isNaN(r.lat) || Number.isNaN(r.lng)) continue;
    seen.add(r.staffId);
    markers.push({
      staffId: r.staffId,
      name: r.displayName || '-',
      territory: r.territoryName,
      lat: r.lat,
      lng: r.lng,
    });
  }

  return markers;
}
