'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import type { TodayOperatorMarker } from '@/lib/dashboard/todayOperators';

type Props = { operators: TodayOperatorMarker[] };

export default function TodayMapLeaflet({ operators }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    let layerGroup: LayerGroup | null = null;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false }).setView([41.9, 12.5], 6);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layer = L.layerGroup().addTo(map);
      layerGroup = layer;
      const points: [number, number][] = [];

      // Resolve CSS tokens at mount (Leaflet can't resolve var() in JS)
      const css = getComputedStyle(document.documentElement);
      const markerColor = css.getPropertyValue('--status-progress').trim() || '#1570d1';
      const markerFill = css.getPropertyValue('--brand-primary-soft').trim() || '#1570d1';

      for (const op of operators) {
        points.push([op.lat, op.lng]);
        L.circleMarker([op.lat, op.lng], {
          radius: 8,
          color: markerColor,
          weight: 2,
          fillColor: markerFill,
          fillOpacity: 0.85,
        })
          .bindPopup(`<strong>${op.name}</strong>${op.territory ? `<br/>${op.territory}` : ''}`)
          .addTo(layer);
      }

      if (points.length === 1) {
        map.setView(points[0], 12);
      } else if (points.length > 1) {
        map.fitBounds(points, { padding: [30, 30], maxZoom: 13 });
      }
    })();

    return () => {
      cancelled = true;
      layerGroup?.remove();
    };
  }, [operators]);

  // Cleanup mappa allo smontaggio
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
