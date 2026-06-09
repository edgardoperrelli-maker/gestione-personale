'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { coloreStato, type TonoTorre } from '@/lib/interventi/torreView';
import type { TorreIntervento } from './TorreControlloClient';

const DOT: Record<TonoTorre, string> = {
  ok: '#22c55e',
  ko: '#ef4444',
  attesa: '#fbbf24',
  corso: '#38bdf8',
  annullato: '#9ca3af',
  da_assegnare: '#9ca3af',
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
    const layer = layerRef.current;
    layer.clearLayers();
    const pts: Leaflet.LatLngTuple[] = [];
    for (const it of interventi) {
      if (it.lat == null || it.lng == null) continue;
      const color = DOT[coloreStato(it.stato, it.esito)];
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
