'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { coloreStato, type TonoTorre } from '@/lib/interventi/torreView';
import type { TorreIntervento } from './LiveClient';

// Token names — resolved at runtime via getComputedStyle (Leaflet doesn't resolve CSS vars in JS)
const DOT_TOKEN: Record<TonoTorre, string> = {
  ok: '--status-ok',
  ko: '--status-ko',
  attesa: '--status-warn',
  corso: '--status-progress',
  annullato: '--status-idle',
  da_assegnare: '--status-idle',
};

export default function TorreMappa({ interventi }: { interventi: TorreIntervento[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import('leaflet');
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView([41.9, 12.5], 6);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
      layerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      setLeaflet(L);
    })();
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !layerRef.current || !mapInstanceRef.current) return;
    // Resolve CSS tokens to actual color values once per render (Leaflet can't resolve var() in JS)
    const css = getComputedStyle(document.documentElement);
    const resolvedDot = Object.fromEntries(
      Object.entries(DOT_TOKEN).map(([k, token]) => [k, css.getPropertyValue(token).trim() || token]),
    ) as Record<TonoTorre, string>;
    const layer = layerRef.current;
    layer.clearLayers();
    const pts: Leaflet.LatLngTuple[] = [];
    for (const it of interventi) {
      if (it.lat == null || it.lng == null) continue;
      const color = resolvedDot[coloreStato(it.stato, it.esito)];
      leaflet
        .circleMarker([it.lat, it.lng], { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
        .bindPopup(`${it.nominativo ?? it.odl ?? 'Intervento'}${it.comune ? ' · ' + it.comune : ''}`)
        .addTo(layer);
      pts.push([it.lat, it.lng]);
    }
    if (pts.length > 0) mapInstanceRef.current.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
  }, [leaflet, interventi]);

  return (
    <div
      ref={mapRef}
      className="h-[420px] w-full overflow-hidden rounded-2xl border"
      style={{ borderColor: 'var(--brand-border)' }}
    />
  );
}
