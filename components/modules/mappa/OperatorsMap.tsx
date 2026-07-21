'use client';

/**
 * OperatorsMap — mappa a punti unificata basata su **mapcn** (MapLibre GL).
 *
 * Pilota della migrazione da Leaflet (Fase 1): sostituisce la logica imperativa
 * `circleMarker + bindPopup + fitBounds` delle mappe minori con i componenti
 * dichiarativi di mapcn (`@/components/ui/map`).
 *
 * Deve essere caricato lato client (WebGL): i consumer lo importano già via
 * `next/dynamic(..., { ssr: false })` (DashboardTodayMap, LiveClient→TorreMappa).
 *
 * Vantaggi rispetto alla versione Leaflet:
 * - i marker sono nodi DOM → i colori possono usare `var(--token)` direttamente,
 *   niente più `getComputedStyle` per risolvere i token di design;
 * - i popup seguono il tema (`bg-popover`/`text-popover-foreground`);
 * - il basemap (default CARTO positron/dark-matter) è theme-aware ed è
 *   sostituibile in futuro via la prop `styles` (es. PMTiles self-host).
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  useMap,
} from '@/components/ui/map';
import { useAppTheme } from '@/hooks/useAppTheme';

export type OperatorsMapPoint = {
  id: string;
  lat: number;
  lng: number;
  /** Colore del bordo/anello del punto. Accetta `var(--token)`. */
  color: string;
  /** Colore del riempimento; default = `color`. */
  fillColor?: string;
  /** Diametro del punto in px; default 16. */
  size?: number;
  /** Opacità del riempimento 0–1; default 0.85. */
  fillOpacity?: number;
  /** Spessore del bordo in px; default 2. */
  weight?: number;
  /** Contenuto del popup (mostrato al click sul marker). */
  popup?: ReactNode;
};

type Props = {
  points: OperatorsMapPoint[];
  /** Classi aggiuntive per il contenitore (deve avere un'altezza esplicita). */
  className?: string;
  /** Disabilita lo zoom con la rotella del mouse. */
  scrollZoom?: boolean;
  /** Zoom usato quando è presente un solo punto (default 12). */
  singlePointZoom?: number;
  /** Zoom massimo applicato dal fitBounds (default 13). */
  maxZoom?: number;
  /** Padding del fitBounds in px (default 30). */
  fitPadding?: number;
  /** Mostra i controlli zoom (default true). */
  controls?: boolean;
};

/** Centro iniziale sull'Italia (verrà sovrascritto dal fitBounds). */
const ITALY_CENTER: [number, number] = [12.5, 41.9];

function isValid(p: OperatorsMapPoint) {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/**
 * Inquadra i punti quando la mappa è pronta o i dati cambiano.
 * (mapcn non fornisce un helper `fitBounds`: si usa `useMap()` sull'istanza.)
 */
function FitBounds({
  points,
  singlePointZoom,
  maxZoom,
  padding,
}: {
  points: OperatorsMapPoint[];
  singlePointZoom: number;
  maxZoom: number;
  padding: number;
}) {
  const { map, isLoaded } = useMap();

  // Firma stabile: rifà il fit solo quando cambiano le coordinate effettive.
  const signature = useMemo(
    () =>
      points
        .filter(isValid)
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .join('|'),
    [points],
  );

  useEffect(() => {
    if (!map || !isLoaded) return;
    const coords = points.filter(isValid);
    if (coords.length === 0) return;

    if (coords.length === 1) {
      map.easeTo({ center: [coords[0].lng, coords[0].lat], zoom: singlePointZoom, duration: 0 });
      return;
    }

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const c of coords) {
      minLng = Math.min(minLng, c.lng);
      maxLng = Math.max(maxLng, c.lng);
      minLat = Math.min(minLat, c.lat);
      maxLat = Math.max(maxLat, c.lat);
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding, maxZoom, duration: 0 },
    );
    // `signature` copre le variazioni di coordinate; gli altri sono valori stabili.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, signature, singlePointZoom, maxZoom, padding]);

  return null;
}

function MarkerDot(p: OperatorsMapPoint) {
  const size = p.size ?? 16;
  const weight = p.weight ?? 2;
  const fill = p.fillColor ?? p.color;
  const fillOpacity = p.fillOpacity ?? 0.85;
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${weight}px solid ${p.color}`,
        // Riempimento traslucido mantenendo il bordo opaco (equivalente a
        // Leaflet `fillOpacity`): color-mix accetta anche `var(--token)`.
        backgroundColor: `color-mix(in srgb, ${fill} ${Math.round(fillOpacity * 100)}%, transparent)`,
        boxShadow: '0 1px 4px rgba(0,0,0,.3)',
      }}
    />
  );
}

export default function OperatorsMap({
  points,
  className,
  scrollZoom = true,
  singlePointZoom = 12,
  maxZoom = 13,
  fitPadding = 30,
  controls = true,
}: Props) {
  const theme = useAppTheme();
  const valid = points.filter(isValid);

  return (
    <Map
      theme={theme}
      className={className ?? 'h-full w-full'}
      center={ITALY_CENTER}
      zoom={5}
      scrollZoom={scrollZoom}
      attributionControl={{ compact: true }}
    >
      {controls ? <MapControls position="top-right" /> : null}
      <FitBounds
        points={valid}
        singlePointZoom={singlePointZoom}
        maxZoom={maxZoom}
        padding={fitPadding}
      />
      {valid.map((p) => (
        <MapMarker key={p.id} longitude={p.lng} latitude={p.lat}>
          <MarkerContent>
            <MarkerDot {...p} />
          </MarkerContent>
          {p.popup != null ? (
            <MarkerPopup className="text-xs leading-relaxed">{p.popup}</MarkerPopup>
          ) : null}
        </MapMarker>
      ))}
    </Map>
  );
}
