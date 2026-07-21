'use client';

/**
 * PlanningMap — mappa operativa di pianificazione basata su **mapcn** (MapLibre GL).
 *
 * Fase 2 della migrazione da Leaflet: sostituisce la logica imperativa di
 * `MappaOperatoriClient` (tre effetti con `clearLayers` + ricostruzione di
 * circleMarker/divIcon/polyline, `excelMarkersRef`, `panTo`+`openPopup`) con un
 * albero dichiarativo mapcn.
 *
 * Il chiamante passa descrittori puri (marker + rotte) calcolati da `useMemo`;
 * qui li rendiamo con:
 * - marker DOM (`MarkerContent`) → i pin numerati HTML e i cerchi colorati
 *   restano identici e i colori possono usare `var(--token)` direttamente;
 * - `MapRoute` per le polyline (le rotte usano colori concreti: MapLibre paint
 *   non risolve le CSS var, quindi qui risolviamo eventuali `var(--token)`);
 * - un unico popup controllato (`MapPopup`) pilotato sia dal click sul marker
 *   sia dalla richiesta di focus dal pannello laterale (rimpiazza `openPopup`).
 *
 * Deve essere caricato via `next/dynamic(..., { ssr: false })` (WebGL/DOM).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Map,
  MapControls,
  MapMarker,
  MapPopup,
  MapRoute,
  MarkerContent,
  useMap,
} from '@/components/ui/map';
import { useAppTheme } from '@/hooks/useAppTheme';

type CircleRender = {
  kind: 'circle';
  /** Colore bordo (accetta `var(--token)`). */
  color: string;
  /** Colore riempimento (accetta `var(--token)`). */
  fillColor: string;
  /** Diametro in px. */
  size: number;
  /** Spessore bordo in px. */
  weight: number;
  /** Opacità del riempimento 0–1. */
  fillOpacity: number;
};

type PinRender = {
  kind: 'pin';
  /** Etichetta (numero d'ordine o "S"). */
  label: string;
  /** Sfondo del pin (accetta `var(--token)` o hex). */
  bg: string;
  /** Colore del testo (accetta `var(--token)`). */
  fg: string;
  shape: 'circle' | 'pill';
  /** Diametro (circle) / altezza e min-width (pill) in px. */
  size: number;
};

export type PlanningMarker = {
  id: string;
  lat: number;
  lng: number;
  render: CircleRender | PinRender;
  popup?: ReactNode;
  onClick?: () => void;
};

export type PlanningRoute = {
  id: string;
  coords: Array<{ lat: number; lng: number }>;
  /** Colore concreto o `var(--token)` (risolto internamente per MapLibre). */
  color: string;
  opacity?: number;
};

export type PlanningFocus = { id: string; nonce: number } | null;

type Props = {
  markers: PlanningMarker[];
  routes?: PlanningRoute[];
  /** Richiesta di centraggio+popup su un marker (dal pannello laterale). */
  focus?: PlanningFocus;
  className?: string;
  /** Padding del fitBounds in px. */
  fitPadding?: number;
};

/** Centro iniziale sull'Italia (sovrascritto dal fitBounds). */
const ITALY_CENTER: [number, number] = [12.5, 41.9];

function isValid(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

/** Risolve `var(--token)` → colore concreto (MapLibre paint non legge le CSS var). */
function resolveCssColor(value: string): string {
  if (typeof document === 'undefined') return value;
  const match = value.match(/^\s*var\((--[A-Za-z0-9-]+)\)\s*$/);
  if (!match) return value;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || value;
}

function MarkerGlyph({ render }: { render: CircleRender | PinRender }) {
  if (render.kind === 'circle') {
    // Riempimento traslucido con bordo opaco (equivalente a Leaflet fillOpacity);
    // color-mix accetta anche `var(--token)` e si risolve nel DOM.
    const fill = `color-mix(in srgb, ${render.fillColor} ${Math.round(render.fillOpacity * 100)}%, transparent)`;
    return (
      <span
        aria-hidden
        style={{
          display: 'block',
          width: render.size,
          height: render.size,
          borderRadius: '50%',
          border: `${render.weight}px solid ${render.color}`,
          backgroundColor: fill,
          boxShadow: '0 1px 4px rgba(0,0,0,.3)',
        }}
      />
    );
  }

  const pill = render.shape === 'pill';
  return (
    <span
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: render.size,
        width: pill ? undefined : render.size,
        height: render.size,
        padding: pill ? '0 6px' : 0,
        borderRadius: pill ? 999 : '50%',
        background: render.bg,
        color: render.fg,
        border: '2px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,.3)',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {render.label}
    </span>
  );
}

/** Inquadra marker + rotte quando la mappa è pronta o cambiano le coordinate. */
function FitController({
  markers,
  routes,
  padding,
}: {
  markers: PlanningMarker[];
  routes: PlanningRoute[];
  padding: number;
}) {
  const { map, isLoaded } = useMap();

  const signature = useMemo(() => {
    const mk = markers.map((m) => `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join('|');
    const rt = routes.map((r) => `${r.id}:${r.coords.length}`).join(',');
    return `${mk}#${rt}`;
  }, [markers, routes]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const pts: Array<[number, number]> = []; // [lng, lat]
    for (const m of markers) if (isValid(m.lat, m.lng)) pts.push([m.lng, m.lat]);
    for (const r of routes) for (const c of r.coords) if (isValid(c.lat, c.lng)) pts.push([c.lng, c.lat]);
    if (pts.length === 0) return;

    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: 14, duration: 0 });
      return;
    }
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of pts) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding, maxZoom: 16, duration: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, signature, padding]);

  return null;
}

/** Su richiesta di focus: centra sul marker e ne apre il popup (selezione controllata). */
function FocusController({
  focus,
  markers,
  onSelect,
}: {
  focus: PlanningFocus;
  markers: PlanningMarker[];
  onSelect: (id: string) => void;
}) {
  const { map, isLoaded } = useMap();
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    if (!focus || !map || !isLoaded) return;
    const m = markersRef.current.find((x) => x.id === focus.id);
    if (!m || !isValid(m.lat, m.lng)) return;
    map.panTo([m.lng, m.lat]);
    onSelect(focus.id);
    // Ri-esegue solo al variare della richiesta (id/nonce), non sui cambi dati.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.nonce, map, isLoaded]);

  return null;
}

export default function PlanningMap({
  markers,
  routes = [],
  focus = null,
  className,
  fitPadding = 24,
}: Props) {
  const theme = useAppTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const valid = useMemo(() => markers.filter((m) => isValid(m.lat, m.lng)), [markers]);
  const selected = selectedId ? valid.find((m) => m.id === selectedId) ?? null : null;

  // Se il marker selezionato scompare (cambio dati/modalità), chiude il popup.
  useEffect(() => {
    if (selectedId && !valid.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [valid, selectedId]);

  return (
    <Map theme={theme} className={className ?? 'h-full w-full'} center={ITALY_CENTER} zoom={5}>
      <MapControls position="top-right" />
      <FitController markers={valid} routes={routes} padding={fitPadding} />
      <FocusController focus={focus} markers={valid} onSelect={setSelectedId} />

      {routes.map((r) => {
        const coords = r.coords
          .filter((c) => isValid(c.lat, c.lng))
          .map((c) => [c.lng, c.lat] as [number, number]);
        if (coords.length < 2) return null;
        return (
          <MapRoute
            key={r.id}
            id={r.id}
            coordinates={coords}
            color={resolveCssColor(r.color)}
            width={3}
            opacity={r.opacity ?? 0.8}
            dashArray={[6, 4]}
            interactive={false}
          />
        );
      })}

      {valid.map((m) => (
        <MapMarker
          key={m.id}
          longitude={m.lng}
          latitude={m.lat}
          onClick={() => {
            m.onClick?.();
            if (m.popup != null) setSelectedId(m.id);
          }}
        >
          <MarkerContent>
            <MarkerGlyph render={m.render} />
          </MarkerContent>
        </MapMarker>
      ))}

      {selected && selected.popup != null ? (
        <MapPopup
          longitude={selected.lng}
          latitude={selected.lat}
          closeButton
          onClose={() => setSelectedId(null)}
          className="text-xs leading-relaxed"
        >
          {selected.popup}
        </MapPopup>
      ) : null}
    </Map>
  );
}
