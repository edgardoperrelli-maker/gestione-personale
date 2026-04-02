'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getTerritoryStyle } from '@/lib/territoryColors';

export type MappaStaffRow = {
  staffId: string;
  displayName: string;
  territoryId: string | null;
  territoryName: string | null;
  activityName: string | null;
  costCenter: string | null;
  day: string;
  reperibile: boolean;
  lat: number | null;
  lng: number | null;
};

type Props = {
  rows: MappaStaffRow[];
  territories: Array<{ id: string; name: string; lat: number | null; lng: number | null }>;
  dateFrom: string;
  dateTo: string;
};

const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

const applyProximityOffset = (points: MappaStaffRow[]) => {
  const groups: Array<{ center: { lat: number; lng: number }; items: MappaStaffRow[] }> = [];

  points.forEach((p) => {
    if (p.lat === null || p.lng === null) return;
    const existing = groups.find((g) => distanceMeters(g.center, { lat: p.lat!, lng: p.lng! }) <= 30);
    if (existing) {
      existing.items.push(p);
      const lats = existing.items.map((i) => i.lat ?? 0);
      const lngs = existing.items.map((i) => i.lng ?? 0);
      existing.center = {
        lat: lats.reduce((a, b) => a + b, 0) / lats.length,
        lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
      };
      return;
    }
    groups.push({ center: { lat: p.lat!, lng: p.lng! }, items: [p] });
  });

  const withOffset: MappaStaffRow[] = [];
  groups.forEach((g) => {
    if (g.items.length === 1) {
      withOffset.push(g.items[0]);
      return;
    }
    const radius = 15;
    const angleStep = (Math.PI * 2) / g.items.length;
    g.items.forEach((item, idx) => {
      const angle = idx * angleStep;
      const latOffset = (radius * Math.cos(angle)) / 111320;
      const lngOffset = (radius * Math.sin(angle)) / (111320 * Math.cos((g.center.lat * Math.PI) / 180));
      withOffset.push({
        ...item,
        lat: g.center.lat + latOffset,
        lng: g.center.lng + lngOffset,
      });
    });
  });

  return withOffset;
};

export default function MappaOperatoriClient({ rows, territories, dateFrom, dateTo }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);

  const [territoryFilter, setTerritoryFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [onlyRep, setOnlyRep] = useState(false);

  const dayOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.day));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (territoryFilter && r.territoryId !== territoryFilter) return false;
      if (dayFilter && r.day !== dayFilter) return false;
      if (onlyRep && !r.reperibile) return false;
      return true;
    });
  }, [rows, territoryFilter, dayFilter, onlyRep]);

  const rowsWithCoords = filteredRows.filter((r) => r.lat !== null && r.lng !== null);
  const rowsNoCoords = filteredRows.filter((r) => r.lat === null || r.lng === null);

  const stats = useMemo(() => {
    const staffIds = new Set(filteredRows.map((r) => r.staffId));
    const rep = filteredRows.filter((r) => r.reperibile).length;
    return {
      total: filteredRows.length,
      staff: staffIds.size,
      reperibili: rep,
      inMap: rowsWithCoords.length,
      missing: rowsNoCoords.length,
    };
  }, [filteredRows, rowsWithCoords.length, rowsNoCoords.length]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = await import('leaflet');
      if (!alive) return;
      setLeaflet(L);
      if (!mapRef.current || mapInstanceRef.current) return;
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([41.9, 12.5], 6);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      layerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    })();

    return () => {
      alive = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !layerRef.current || !mapInstanceRef.current) return;
    const layer = layerRef.current;
    const map = mapInstanceRef.current;
    layer.clearLayers();

    const adjusted = applyProximityOffset(rowsWithCoords);
    const bounds: Array<[number, number]> = [];

    adjusted.forEach((row) => {
      if (row.lat === null || row.lng === null) return;
      const style = getTerritoryStyle(row.territoryName);
      const marker = leaflet.circleMarker([row.lat, row.lng], {
        radius: row.reperibile ? 9 : 7,
        color: row.reperibile ? '#DC2626' : style.band,
        weight: 2,
        fillColor: style.bg,
        fillOpacity: 0.9,
      });

      const popup = `
        <div style="font-size:12px;line-height:1.4">
          <div style="font-weight:600">${row.displayName}</div>
          ${row.reperibile ? '<span style="color:#DC2626;font-weight:700">REP</span>' : ''}
          <div>Territorio: ${row.territoryName ?? '-'}</div>
          <div>Attivita: ${row.activityName ?? '-'}</div>
          <div>CdC: ${row.costCenter ?? '-'}</div>
          <div>Giorno: ${row.day}</div>
        </div>
      `;

      marker.bindPopup(popup);
      marker.addTo(layer);
      bounds.push([row.lat, row.lng]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [leaflet, rowsWithCoords]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xl font-semibold">Mappa Operatori</div>
            <div className="text-sm text-[var(--brand-text-muted)]">
              Periodo: {dateFrom} ? {dateTo}
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={territoryFilter}
              onChange={(e) => setTerritoryFilter(e.target.value)}
              className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Tutti i territori</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Tutti i giorni</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyRep} onChange={(e) => setOnlyRep(e.target.checked)} />
              Solo reperibili
            </label>

            <button
              type="button"
              onClick={() => {
                setTerritoryFilter('');
                setDayFilter('');
                setOnlyRep(false);
              }}
              className="rounded-lg border border-[var(--brand-border)] bg-white px-3 py-1.5 text-sm"
            >
              Azzera
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
            <div className="text-xs text-[var(--brand-text-muted)]">Assegnazioni filtrate</div>
            <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
            <div className="text-xs text-[var(--brand-text-muted)]">Operatori unici</div>
            <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.staff}</div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
            <div className="text-xs text-[var(--brand-text-muted)]">Reperibili</div>
            <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.reperibili}</div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
            <div className="text-xs text-[var(--brand-text-muted)]">Su mappa</div>
            <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.inMap}</div>
          </div>
          <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
            <div className="text-xs text-[var(--brand-text-muted)]">Senza coordinate</div>
            <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.missing}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm">
          <div ref={mapRef} className="h-[520px] w-full rounded-2xl" />
        </div>

        <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">Senza coordinate</div>
          {rowsNoCoords.length ? (
            <div className="space-y-2">
              {rowsNoCoords.map((row) => (
                <div key={`${row.staffId}-${row.day}`} className="rounded-xl border border-[var(--brand-border)] p-2">
                  <div className="text-sm font-semibold">{row.displayName}</div>
                  <div className="text-xs text-[var(--brand-text-muted)]">{row.territoryName ?? '-'}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span>{row.day}</span>
                    {row.reperibile && (
                      <span className="rounded border border-red-200 bg-red-100 px-1 text-[10px] font-bold text-red-700">
                        REP
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--brand-text-muted)]">Tutti gli operatori hanno coordinate.</div>
          )}
        </div>
      </div>
    </div>
  );
}

