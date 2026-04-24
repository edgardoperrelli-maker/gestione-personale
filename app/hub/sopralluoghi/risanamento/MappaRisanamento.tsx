'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Rectangle as LeafletRectangle } from 'leaflet';
import type { MicroareaStats } from './RisanamentoClient';

type LeafletModule = typeof import('leaflet');

type Props = {
  microareeStats: MicroareaStats[];
  onMicroareaClick: (microarea: string) => void;
  microareeSelezionate: string[];
};

function getColor(visitati: number, totale: number): string {
  if (totale === 0) return '#3b82f6';
  const perc = visitati / totale;
  if (perc > 0.8) return '#10b981';
  if (perc > 0.3) return '#f59e0b';
  return '#3b82f6';
}

export default function MappaRisanamento({
  microareeStats,
  onMicroareaClick,
  microareeSelezionate,
}: Props) {
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<Map<string, LeafletRectangle>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let active = true;
    const layers = layersRef.current;

    const setupMap = async () => {
      if (!containerRef.current || mapRef.current) return;

      const leaflet = await import('leaflet');
      if (!active || !containerRef.current || mapRef.current) return;

      leafletRef.current = leaflet;
      const map = leaflet.map(containerRef.current).setView([40.8518, 14.2681], 12);

      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);
    };

    void setupMap();

    return () => {
      active = false;
      setMapReady(false);
      const map = mapRef.current;
      mapRef.current = null;
      leafletRef.current = null;
      layers.clear();

      if (map) {
        map.remove();
      }
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map) return;

    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current.clear();

    microareeStats.forEach((stats) => {
      if (
        stats.lat_min == null
        || stats.lat_max == null
        || stats.lon_min == null
        || stats.lon_max == null
      ) {
        return;
      }

      const bounds = leaflet.latLngBounds(
        [stats.lat_min, stats.lon_min],
        [stats.lat_max, stats.lon_max],
      );

      const isSelected = microareeSelezionate.includes(stats.microarea);
      const rect = leaflet.rectangle(bounds, {
        color: isSelected ? '#7c3aed' : getColor(stats.visitati, stats.totale_civici),
        weight: isSelected ? 2 : 1,
        fillOpacity: isSelected ? 0.5 : 0.3,
      }).addTo(map);

      rect.bindTooltip(
        `<strong>${stats.microarea}</strong><br>Comune: ${stats.comune ?? '-'}<br>Civici: ${stats.totale_civici}<br>Visitati: ${stats.visitati}`,
        { sticky: true },
      );

      rect.on('click', () => onMicroareaClick(stats.microarea));
      layersRef.current.set(stats.microarea, rect);
    });
  }, [mapReady, microareeStats, microareeSelezionate, onMicroareaClick]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map || microareeSelezionate.length > 0 || microareeStats.length === 0) return;

    const validBounds = microareeStats
      .filter((stats) => (
        stats.lat_min != null
        && stats.lat_max != null
        && stats.lon_min != null
        && stats.lon_max != null
      ))
      .map((stats) => leaflet.latLngBounds(
        [stats.lat_min, stats.lon_min],
        [stats.lat_max, stats.lon_max],
      ));

    if (validBounds.length === 0) return;

    const allBounds = validBounds.reduce((current, bounds) => current.extend(bounds));
    map.fitBounds(allBounds, { padding: [30, 30] });
  }, [mapReady, microareeStats, microareeSelezionate]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !leaflet || !map || microareeSelezionate.length === 0) return;

    const selectedStats = microareeStats.filter((entry) => (
      microareeSelezionate.includes(entry.microarea)
      && entry.lat_min != null
      && entry.lat_max != null
      && entry.lon_min != null
      && entry.lon_max != null
    ));

    if (selectedStats.length === 0) {
      return;
    }

    const bounds = selectedStats.reduce((currentBounds, stats, index) => {
      const entryBounds = leaflet.latLngBounds(
        [stats.lat_min, stats.lon_min],
        [stats.lat_max, stats.lon_max],
      );

      if (index === 0) {
        return entryBounds;
      }

      return currentBounds.extend(entryBounds);
    }, leaflet.latLngBounds(
      [selectedStats[0].lat_min, selectedStats[0].lon_min],
      [selectedStats[0].lat_max, selectedStats[0].lon_max],
    ));

    map.fitBounds(bounds, { padding: [40, 40] });
  }, [mapReady, microareeSelezionate, microareeStats]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[600px] w-full rounded-lg border border-[var(--border-subtle)]"
      />
      <div className="absolute bottom-6 right-3 z-[1000] rounded-lg border border-[var(--border-subtle)] bg-white p-3 text-xs shadow-md">
        <div className="mb-1 font-medium text-[var(--text-primary)]">Avanzamento</div>
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm bg-[#3b82f6] opacity-60" />
          Da visitare
        </div>
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm bg-[#f59e0b] opacity-60" />
          Parziale
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm bg-[#10b981] opacity-60" />
          Completato
        </div>
      </div>
    </div>
  );
}
