'use client';

import type * as Leaflet from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTerritoryStyle } from '@/lib/territoryColors';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { geocodeTask, optimizeRoute, parseExcelToTasks } from '@/utils/routing';
import type { OperatorBase, RouteResult, Task } from '@/utils/routing';

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

export type ZtlZoneInfo = {
  id: string;
  name: string;
  cap_list: string[];
  authorized_staff_ids: string[];
  authorized_names: string[];
};

export type MappaOperatorOption = {
  id: string;
  displayName: string;
  startAddress: string | null;
  startLat: number | null;
  startLng: number | null;
};

type Props = {
  rows: MappaStaffRow[];
  operatorOptions: MappaOperatorOption[];
  territories: Array<{ id: string; name: string; lat: number | null; lng: number | null }>;
  dateFrom: string;
  dateTo: string;
  ztlZones?: ZtlZoneInfo[];
};

type DistEntry = {
  op: string;
  staffId: string;
  color: string;
  tasks: Task[];
  km: number;
  polyline: Array<{ lat: number; lng: number }>;
  base: OperatorBase | null;
  startAddress: string | null;
};
type OpConfig = { id: string; name: string; qty: number; base: OperatorBase | null; startAddress: string | null };
type ExcelMarker = Leaflet.Marker | Leaflet.CircleMarker;
type CapacityDistributionResult = { groups: Task[][]; unassigned: Task[] };

// ─── Palette colori operatori ────────────────────────────────────────────────

const OP_COLORS = [
  '#2563EB', // blue
  '#16A34A', // green
  '#DC2626', // red
  '#7C3AED', // purple
  '#EA580C', // orange
  '#0891B2', // cyan
  '#BE185D', // pink
  '#854D0E', // brown
];

// ─── Helper: distanza in metri ───────────────────────────────────────────────

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

// ─── Helper: offset prossimità ───────────────────────────────────────────────

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
    if (g.items.length === 1) { withOffset.push(g.items[0]); return; }
    const radius = 15;
    const angleStep = (Math.PI * 2) / g.items.length;
    g.items.forEach((item, idx) => {
      const angle = idx * angleStep;
      const latOffset = (radius * Math.cos(angle)) / 111320;
      const lngOffset = (radius * Math.sin(angle)) / (111320 * Math.cos((g.center.lat * Math.PI) / 180));
      withOffset.push({ ...item, lat: g.center.lat + latOffset, lng: g.center.lng + lngOffset });
    });
  });
  return withOffset;
};

// ─── Algoritmo distribuzione spaziale ───────────────────────────────────────

/**
 * Distribuisce i task geocodificati in zone geograficamente compatte
 * rispettando le quantità per operatore.
 *
 * Algoritmo in due fasi:
 *  1. K-means iterativo (5 passaggi) → cluster naturali senza vincoli di capacità
 *  2. Ribilanciamento di confine → sposta solo i task "di bordo" (più vicini
 *     a un altro cluster) fino a rispettare i target, preservando la coerenza
 *     geografica.
 */
function capacityDistribute(tasks: Task[], ops: OpConfig[]): Task[][] {
  const n = ops.length;
  if (!tasks.length || !n) return Array.from({ length: n }, () => []);

  // ── Calcola target ──────────────────────────────────────────────────────────
  const totalQty = ops.reduce((s, o) => s + o.qty, 0);
  let targets: number[];
  if (totalQty === 0) {
    const base = Math.floor(tasks.length / n);
    const extra = tasks.length % n;
    targets = ops.map((_, i) => base + (i < extra ? 1 : 0));
  } else {
    let assigned = 0;
    targets = ops.map((op, i) => {
      if (i === n - 1) return Math.max(0, tasks.length - assigned);
      const t = Math.max(1, Math.round((op.qty / totalQty) * tasks.length));
      assigned += t;
      return t;
    });
  }

  // ── Fase 1: K-means ─────────────────────────────────────────────────────────

  // Centri iniziali: usa le basi operatori se presenti, altrimenti max-min spread
  type Pt = { lat: number; lng: number };
  let centers: Pt[] = ops
    .map((op) => op.base)
    .filter((base): base is OperatorBase => base !== null)
    .map((base) => ({ lat: base.lat, lng: base.lng }));

  if (!centers.length) {
    centers = [{ lat: tasks[0].lat!, lng: tasks[0].lng! }];
  }

  while (centers.length < n) {
    let maxD = -1;
    let best: Pt = centers[0];
    for (const t of tasks) {
      const minD = Math.min(...centers.map((c) => distanceMeters(c, { lat: t.lat!, lng: t.lng! })));
      if (minD > maxD) { maxD = minD; best = { lat: t.lat!, lng: t.lng! }; }
    }
    centers.push(best);
  }

  let groups: Task[][] = Array.from({ length: n }, () => []);

  for (let iter = 0; iter < 8; iter++) {
    groups = Array.from({ length: n }, () => []);
    for (const t of tasks) {
      let bestI = 0;
      let bestD = Infinity;
      centers.forEach((c, i) => {
        const d = distanceMeters(c, { lat: t.lat!, lng: t.lng! });
        if (d < bestD) { bestD = d; bestI = i; }
      });
      groups[bestI].push(t);
    }
    // Aggiorna centri
    centers = groups.map((grp, i) => {
      if (!grp.length) return centers[i];
      return {
        lat: grp.reduce((s, t) => s + t.lat!, 0) / grp.length,
        lng: grp.reduce((s, t) => s + t.lng!, 0) / grp.length,
      };
    });
  }

  // ── Fase 2: Ribilanciamento di confine ──────────────────────────────────────
  // Sposta dalla fine i task "di bordo" (quelli più vicini a un altro centro)
  // verso i cluster sotto-target, senza mai spostare task interni.

  for (let pass = 0; pass < tasks.length * 2; pass++) {
    // Trova un cluster sopra-target con un cluster sotto-target disponibile
    const overIdx = groups.findIndex((g, i) => g.length > targets[i]);
    const underIdx = groups.findIndex((g, i) => g.length < targets[i]);
    if (overIdx === -1 || underIdx === -1) break;

    // Nel cluster over, trova il task più vicino al centro del cluster under
    const underCenter = centers[underIdx];
    let borderIdx = 0;
    let borderD = Infinity;
    groups[overIdx].forEach((t, ti) => {
      const d = distanceMeters({ lat: t.lat!, lng: t.lng! }, underCenter);
      if (d < borderD) { borderD = d; borderIdx = ti; }
    });

    const [moved] = groups[overIdx].splice(borderIdx, 1);
    groups[underIdx].push(moved);

    // Aggiorna il centro del cluster modificato (leggero aggiustamento)
    [overIdx, underIdx].forEach((ci) => {
      const grp = groups[ci];
      if (!grp.length) return;
      centers[ci] = {
        lat: grp.reduce((s, t) => s + t.lat!, 0) / grp.length,
        lng: grp.reduce((s, t) => s + t.lng!, 0) / grp.length,
      };
    });
  }

  return groups;
}

// ─── ExcelJS helpers (stessa logica del modulo Rapportini Clientela) ─────────

function capacityDistributeWithUnassigned(tasks: Task[], ops: OpConfig[]): CapacityDistributionResult {
  const n = ops.length;
  if (!tasks.length || !n) {
    return { groups: Array.from({ length: n }, () => []), unassigned: [...tasks] };
  }

  const explicitTargets = ops.map((op) => Math.max(0, Math.trunc(op.qty)));
  const explicitTotal = explicitTargets.reduce((sum, qty) => sum + qty, 0);

  let targets: number[];
  if (explicitTotal === 0) {
    targets = capacityDistribute(tasks, ops).map((group) => group.length);
  } else if (explicitTotal <= tasks.length) {
    targets = explicitTargets;
  } else {
    const scaled = explicitTargets.map((qty) => (qty / explicitTotal) * tasks.length);
    targets = scaled.map((qty) => Math.floor(qty));

    let remainder = tasks.length - targets.reduce((sum, qty) => sum + qty, 0);
    const ranked = scaled
      .map((qty, index) => ({ index, fraction: qty - Math.floor(qty) }))
      .sort((a, b) => b.fraction - a.fraction);

    for (const { index } of ranked) {
      if (remainder <= 0) break;
      if (targets[index] >= explicitTargets[index]) continue;
      targets[index] += 1;
      remainder -= 1;
    }
  }

  const activeOps = targets
    .map((target, index) => ({ index, target }))
    .filter((entry) => entry.target > 0);

  if (!activeOps.length) {
    return { groups: Array.from({ length: n }, () => []), unassigned: [...tasks] };
  }

  type Pt = { lat: number; lng: number };

  let centers: Pt[] = [{ lat: tasks[0].lat!, lng: tasks[0].lng! }];
  while (centers.length < Math.min(activeOps.length, tasks.length)) {
    let maxD = -1;
    let best: Pt = centers[0];
    for (const task of tasks) {
      const minD = Math.min(...centers.map((center) => distanceMeters(center, { lat: task.lat!, lng: task.lng! })));
      if (minD > maxD) {
        maxD = minD;
        best = { lat: task.lat!, lng: task.lng! };
      }
    }
    centers.push(best);
  }

  let assignedGroups: Task[][] = Array.from({ length: activeOps.length }, () => []);
  let unassigned: Task[] = [];

  for (let iter = 0; iter < 8; iter++) {
    assignedGroups = Array.from({ length: activeOps.length }, () => []);
    unassigned = [];
    const slots = activeOps.map((entry) => entry.target);

    const rankedTasks = tasks
      .map((task) => {
        const preferences = centers
          .map((center, clusterIndex) => ({
            clusterIndex,
            distance: distanceMeters(center, { lat: task.lat!, lng: task.lng! }),
          }))
          .sort((a, b) => a.distance - b.distance);

        const best = preferences[0]?.distance ?? Infinity;
        const second = preferences[1]?.distance ?? Infinity;

        return {
          task,
          preferences,
          advantage: second - best,
          nearest: best,
        };
      })
      .sort((a, b) => {
        if (b.advantage !== a.advantage) return b.advantage - a.advantage;
        return a.nearest - b.nearest;
      });

    for (const entry of rankedTasks) {
      let placed = false;
      for (const preference of entry.preferences) {
        if (slots[preference.clusterIndex] <= 0) continue;
        assignedGroups[preference.clusterIndex].push(entry.task);
        slots[preference.clusterIndex] -= 1;
        placed = true;
        break;
      }
      if (!placed) {
        unassigned.push(entry.task);
      }
    }

    centers = centers.map((center, clusterIndex) => {
      const group = assignedGroups[clusterIndex];
      if (!group.length) return center;
      return {
        lat: group.reduce((sum, task) => sum + task.lat!, 0) / group.length,
        lng: group.reduce((sum, task) => sum + task.lng!, 0) / group.length,
      };
    });
  }

  const groups = Array.from({ length: n }, () => [] as Task[]);
  activeOps.forEach((entry, clusterIndex) => {
    groups[entry.index] = assignedGroups[clusterIndex];
  });

  return { groups, unassigned };
}

function sanitizeSheetName(s: string) {
  return s.replace(/[:\\/?*[\]]/g, ' ');
}

function cloneFromTemplate(base: ExcelJS.Worksheet, name: string, wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(name, {
    views: base.views,
    properties: base.properties,
    pageSetup: base.pageSetup,
    headerFooter: base.headerFooter,
  });

  const maxCols = Math.max(...base.columns.map((c) => (c?.number || 0)));
  for (let c = 1; c <= maxCols; c++) {
    const bc = base.getColumn(c);
    ws.getColumn(c).width = bc.width;
    ws.getColumn(c).hidden = bc.hidden;
  }

  for (let r = 1; r <= base.rowCount; r++) {
    const br = base.getRow(r);
    const wr = ws.getRow(r);
    wr.height = br.height;
    for (let c = 1; c <= maxCols; c++) {
      const bc = br.getCell(c);
      const wc = wr.getCell(c);
      wc.value = bc.value;
      // @ts-ignore
      wc.style = JSON.parse(JSON.stringify(bc.style || {}));
      wc.protection = bc.protection;
      wc.numFmt = bc.numFmt;
    }
    wr.commit();
  }

  // @ts-ignore
  const merges: string[] = (base as any).model?.merges || [];
  for (const m of merges) ws.mergeCells(m);

  return ws;
}

function copyCellTemplate(source: ExcelJS.Cell, target: ExcelJS.Cell) {
  // @ts-ignore
  target.style = JSON.parse(JSON.stringify(source.style || {}));
  target.protection = source.protection;
  target.numFmt = source.numFmt;
}

function copyColumnTemplate(ws: ExcelJS.Worksheet, sourceCol: number, targetCol: number) {
  const source = ws.getColumn(sourceCol);
  const target = ws.getColumn(targetCol);
  target.width = source.width;
  target.hidden = source.hidden;

  for (let r = 1; r <= ws.rowCount; r++) {
    copyCellTemplate(ws.getRow(r).getCell(sourceCol), ws.getRow(r).getCell(targetCol));
  }
}

function prepareReportSheet(ws: ExcelJS.Worksheet) {
  try {
    ws.unMergeCells('A30:O30');
  } catch {}

  ws.spliceColumns(4, 0, []);
  copyColumnTemplate(ws, 5, 4);

  ws.spliceColumns(12, 0, []);
  copyColumnTemplate(ws, 13, 12);

  ws.mergeCells('A30:Q30');
}

function extractReportTime(value: string): string {
  const match = value.match(/\b(\d{2}):(\d{2})\b/);
  return match ? `${match[1]}:${match[2]}` : '';
}

// ─── Helper: trova la zona ZTL di un task dato il CAP ─────────────────────────

function getTaskZtl(cap: string, ztlZones: ZtlZoneInfo[] = []): ZtlZoneInfo | null {
  if (!cap) return null;
  const normalizedCap = cap.trim();
  return ztlZones.find((z) => z.cap_list.includes(normalizedCap)) ?? null;
}

// ─── Componente principale ───────────────────────────────────────────────────

export default function MappaOperatoriClient({ rows, operatorOptions, territories, dateFrom, dateTo, ztlZones = [] }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const excelLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const excelMarkersRef = useRef<Map<string, ExcelMarker>>(new Map());
  const excelTaskItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const geocodingActiveRef = useRef(false);

  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);
  const [territoryFilter, setTerritoryFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [onlyRep, setOnlyRep] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);

  // Excel import
  const [excelTasks, setExcelTasks] = useState<Task[]>([]);
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null);
  const [excelMode, setExcelMode] = useState(false);
  const [excelOnlyManualAction, setExcelOnlyManualAction] = useState(false);

  // Modifica task non geocodificati
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedExcelTaskId, setSelectedExcelTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ indirizzo: '', cap: '', citta: '' });
  const [geocodingSingleId, setGeocodingSingleId] = useState<string | null>(null);

  // Distribuzione operatori
  const [showOpPicker, setShowOpPicker] = useState(false);
  const [selectedOps, setSelectedOps] = useState<OpConfig[]>([]);
  const [distribution, setDistribution] = useState<DistEntry[] | null>(null);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [activeOpIdx, setActiveOpIdx] = useState(0);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  // ZTL conflicts
  const [ztlConflicts, setZtlConflicts] = useState<string[]>([]);

  // ─── Computed ──────────────────────────────────────────────────────────────

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

  // Operatori disponibili da Supabase (periodo corrente)
  const availableOperators = useMemo(() => {
    return [...operatorOptions].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' })
    );
  }, [operatorOptions]);

  const excelOperators = useMemo(() => {
    const names = new Set<string>();
    selectedOps.forEach((op) => {
      const name = op.name.trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  }, [selectedOps]);

  const excelNeedsManualCount = useMemo(() => {
    return excelTasks.filter((task) => task.lat == null || task.lng == null).length;
  }, [excelTasks]);

  const filteredExcelTasks = useMemo(() => {
    return excelTasks.filter((task) => {
      const needsManualAction = task.lat == null || task.lng == null;
      if (excelOnlyManualAction && !needsManualAction) return false;
      return true;
    });
  }, [excelOnlyManualAction, excelTasks]);

  // Route supabase
  const computedRoute = useMemo<RouteResult | null>(() => {
    if (!routeMode || excelMode) return null;
    if (rowsWithCoords.length < 2) return null;
    const tasks = rowsWithCoords.map((r) => ({
      id: `${r.staffId}-${r.day}`,
      odl: '',
      indirizzo: r.territoryName ?? '',
      cap: '',
      citta: '',
      priorita: 0,
      fascia_oraria: '',
      lat: r.lat!,
      lng: r.lng!,
    }));
    return optimizeRoute(tasks);
  }, [routeMode, excelMode, rowsWithCoords]);

  // Route excel singola (senza distribuzione)
  const excelRouteResult = useMemo<RouteResult | null>(() => {
    if (!routeMode || !excelMode || distribution) return null;
    const geocoded = excelTasks.filter((t) => t.lat != null && t.lng != null);
    if (geocoded.length < 2) return null;
    return optimizeRoute(geocoded);
  }, [routeMode, excelMode, distribution, excelTasks]);

  const activeRouteResult = excelMode ? excelRouteResult : computedRoute;

  const excelGeocoded = excelTasks.filter((t) => t.lat != null && t.lng != null).length;
  const isGeocoding = geocodingProgress !== null && geocodingProgress.done < geocodingProgress.total;


  // ─── Lookup supabase ────────────────────────────────────────────────────────

  const rowById = useMemo(() => {
    const m = new Map<string, MappaStaffRow>();
    rowsWithCoords.forEach((r) => m.set(`${r.staffId}-${r.day}`, r));
    return m;
  }, [rowsWithCoords]);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    setRouteResult(activeRouteResult);
  }, [activeRouteResult]);

  useEffect(() => {
    if (!selectedExcelTaskId) return;
    if (excelTasks.some((task) => task.id === selectedExcelTaskId)) return;
    setSelectedExcelTaskId(null);
  }, [excelTasks, selectedExcelTaskId]);

  useEffect(() => {
    if (!selectedExcelTaskId) return;
    const frame = window.requestAnimationFrame(() => {
      const node = excelTaskItemRefs.current[selectedExcelTaskId];
      node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedExcelTaskId, excelMode, distribution, activeOpIdx]);

  // Inizializzazione mappa
  useEffect(() => {
    let alive = true;
    (async () => {
      const L = await import('leaflet');
      if (!alive) return;
      setLeaflet(L);
      if (!mapRef.current || mapInstanceRef.current) return;
      mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView([41.9, 12.5], 6);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
      layerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      excelLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      routeLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    })();
    return () => {
      alive = false;
      geocodingActiveRef.current = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Marker Supabase
  useEffect(() => {
    if (!leaflet || !layerRef.current || !mapInstanceRef.current) return;
    const layer = layerRef.current;
    const map = mapInstanceRef.current;
    layer.clearLayers();
    if (excelMode) return;

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
      marker.bindPopup(`
        <div style="font-size:12px;line-height:1.4">
          <div style="font-weight:600">${row.displayName}</div>
          ${row.reperibile ? '<span style="color:#DC2626;font-weight:700">REP</span>' : ''}
          <div>Territorio: ${row.territoryName ?? '-'}</div>
          <div>Attivita: ${row.activityName ?? '-'}</div>
          <div>CdC: ${row.costCenter ?? '-'}</div>
          <div>Giorno: ${row.day}</div>
        </div>
      `);
      marker.addTo(layer);
      bounds.push([row.lat, row.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
  }, [leaflet, rowsWithCoords, excelMode]);

  // Marker Excel + route distribuzione (effetto unificato)
  useEffect(() => {
    if (!leaflet || !excelLayerRef.current || !routeLayerRef.current || !mapInstanceRef.current) return;
    const exLayer = excelLayerRef.current;
    const rLayer = routeLayerRef.current;
    exLayer.clearLayers();
    rLayer.clearLayers();
    excelMarkersRef.current.clear();

    if (!excelMode) return;

    if (distribution) {
      // Marker e polyline per-operatore
      const bounds: Array<[number, number]> = [];
      distribution.forEach(({ op, color, tasks, polyline, base, startAddress }, i) => {
        if (base) {
          bounds.push([base.lat, base.lng]);
          const baseIcon = leaflet.divIcon({
            className: '',
            html: `<div style="background:#111827;color:#fff;border-radius:999px;min-width:22px;height:22px;padding:0 6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">S</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          leaflet
            .marker([base.lat, base.lng], { icon: baseIcon })
            .bindPopup(`
              <div style="font-size:12px;line-height:1.5">
                <div style="font-weight:600;color:${color}">${op}</div>
                <div>Punto di partenza</div>
                ${startAddress ? `<div>${startAddress}</div>` : ''}
              </div>
            `)
            .addTo(rLayer);
        }
        tasks.forEach((t, idx) => {
          if (t.lat == null || t.lng == null) return;
          bounds.push([t.lat, t.lng]);
          const icon = leaflet.divIcon({
            className: '',
            html: `<div style="background:${color};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${idx + 1}</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          const marker = leaflet.marker([t.lat, t.lng], { icon });
          excelMarkersRef.current.set(t.id, marker);
          marker.on('click', () => {
            setActiveOpIdx(i);
            setSelectedExcelTaskId(t.id);
          });
          marker.bindPopup(`
            <div style="font-size:12px;line-height:1.5">
              <div style="font-weight:600;color:${color}">${op}</div>
              <div>${t.indirizzo}</div>
              <div>${t.cap} ${t.citta}</div>
              ${t.odl ? `<div>ODL: ${t.odl}</div>` : ''}
              ${t.fascia_oraria ? `<div>Fascia: ${t.fascia_oraria}</div>` : ''}
            </div>
          `);
          marker.addTo(exLayer);
        });
        const coords = polyline.map((point) => [point.lat, point.lng] as [number, number]);
        if (coords.length >= 2) {
          leaflet.polyline(coords, { color, weight: 3, opacity: 0.75, dashArray: '6 4' }).addTo(rLayer);
        }
      });
      unassignedTasks.forEach((t) => {
        if (t.lat == null || t.lng == null) return;
        const marker = leaflet.circleMarker([t.lat, t.lng], {
          radius: 7,
          color: '#D97706',
          weight: 2,
          fillColor: '#FEF3C7',
          fillOpacity: 0.95,
        });
        excelMarkersRef.current.set(t.id, marker);
        marker.on('click', () => {
          setSelectedExcelTaskId(t.id);
        });
        marker.bindPopup(`
          <div style="font-size:12px;line-height:1.5">
            <div style="font-weight:600;color:#D97706">Non assegnata</div>
            <div>${t.indirizzo}</div>
            <div>${t.cap} ${t.citta}</div>
            ${t.odl ? `<div>ODL: ${t.odl}</div>` : ''}
            ${t.fascia_oraria ? `<div>Fascia: ${t.fascia_oraria}</div>` : ''}
          </div>
        `);
        marker.addTo(exLayer);
        bounds.push([t.lat, t.lng]);
      });
      if (bounds.length) mapInstanceRef.current.fitBounds(bounds, { padding: [24, 24] });
    } else {
      // Marker Excel singoli (arancione)
      const bounds: Array<[number, number]> = [];
        excelTasks.forEach((t) => {
          if (t.lat == null || t.lng == null) return;
          const marker = leaflet.circleMarker([t.lat, t.lng], {
            radius: 7,
            color: '#D97706',
          weight: 2,
            fillColor: '#FEF3C7',
            fillOpacity: 0.95,
          });
          excelMarkersRef.current.set(t.id, marker);
          marker.on('click', () => {
            setSelectedExcelTaskId(t.id);
          });
          const op = (t as Task & { _operatore?: string })._operatore ?? '';
        marker.bindPopup(`
          <div style="font-size:12px;line-height:1.5">
            ${op ? `<div style="font-weight:600">${op}</div>` : ''}
            <div>${t.indirizzo}</div>
            <div>${t.cap} ${t.citta}</div>
            ${t.odl ? `<div>ODL: ${t.odl}</div>` : ''}
            ${t.fascia_oraria ? `<div>Fascia: ${t.fascia_oraria}</div>` : ''}
          </div>
        `);
        marker.addTo(exLayer);
        bounds.push([t.lat, t.lng]);
      });
      if (bounds.length) mapInstanceRef.current.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [leaflet, excelTasks, excelMode, distribution, unassignedTasks]);

  // Polyline percorso supabase / excel singolo
  useEffect(() => {
    if (!leaflet || !routeLayerRef.current || !mapInstanceRef.current) return;
    if (excelMode) return; // gestito dall'effetto unificato Excel
    const rLayer = routeLayerRef.current;
    rLayer.clearLayers();
    if (!routeResult || !routeMode) return;

    const coords = routeResult.polyline.map((p) => [p.lat, p.lng] as [number, number]);
    if (coords.length < 2) return;

    leaflet.polyline(coords, { color: '#2563EB', weight: 3, opacity: 0.75, dashArray: '6 4' }).addTo(rLayer);
    routeResult.orderedTasks.forEach((task, idx) => {
      if (task.lat == null || task.lng == null) return;
      const icon = leaflet.divIcon({
        className: '',
        html: `<div style="background:#2563EB;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${idx + 1}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      leaflet.marker([task.lat, task.lng], { icon }).addTo(rLayer);
    });
    mapInstanceRef.current!.fitBounds(coords, { padding: [32, 32] });
  }, [leaflet, routeResult, routeMode, excelMode]);

  // ─── Callbacks ──────────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const parsed = await parseExcelToTasks(file);
    // Filtra i record con codice S-AI-051
    const filtered = parsed.filter((t) => {
      const codice = (t.codice ?? '').toString().trim();
      return !/S-AI-051/i.test(codice);
    });
    setExcelTasks(filtered);
    setExcelMode(true);
    setExcelOnlyManualAction(false);
    setRouteMode(false);
    setRouteResult(null);
    setGeocodingProgress(null);
    setDistribution(null);
    setUnassignedTasks([]);
    setSelectedOps([]);
    setSelectedExcelTaskId(null);
    setEditingTaskId(null);
  }, []);

  const startGeocoding = useCallback(async () => {
    geocodingActiveRef.current = true;
    const total = excelTasks.length;
    setGeocodingProgress({ done: 0, total });
    setDistribution(null); // reset distribuzione quando si rigenera
    setUnassignedTasks([]);

    const updated = [...excelTasks];
    for (let i = 0; i < updated.length; i++) {
      if (!geocodingActiveRef.current) break;
      updated[i] = await geocodeTask(updated[i]);
      setExcelTasks([...updated]);
      setGeocodingProgress({ done: i + 1, total });
    }
    geocodingActiveRef.current = false;
  }, [excelTasks]);

  const clearExcel = useCallback(() => {
    geocodingActiveRef.current = false;
    setExcelTasks([]);
    setExcelMode(false);
    setExcelOnlyManualAction(false);
    setGeocodingProgress(null);
    setRouteMode(false);
    setRouteResult(null);
    setDistribution(null);
    setUnassignedTasks([]);
    setSelectedOps([]);
    setSelectedExcelTaskId(null);
    setEditingTaskId(null);
    setShowOpPicker(false);
    setZtlConflicts([]);
  }, []);

  // Apre il form di modifica per un task
  const openEdit = useCallback((task: Task) => {
    setSelectedExcelTaskId(task.id);
    setEditingTaskId(task.id);
    setEditDraft({ indirizzo: task.indirizzo, cap: task.cap, citta: task.citta });
  }, []);

  const focusExcelTask = useCallback((taskId: string) => {
    setSelectedExcelTaskId(taskId);
    const marker = excelMarkersRef.current.get(taskId);
    const map = mapInstanceRef.current;
    if (!marker || !map) return;
    map.panTo(marker.getLatLng(), { animate: true });
    marker.openPopup();
  }, []);

  // Salva la modifica e tenta geocodifica singola
  const saveAndGeocode = useCallback(async (taskId: string) => {
    const { saveManualCorrection } = await import('@/utils/routing/geocodingCache');

    setGeocodingSingleId(taskId);
    const idx = excelTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) { setGeocodingSingleId(null); return; }

    const original = excelTasks[idx]; // indirizzo originale dal file Excel

    const updated = [...excelTasks];
    updated[idx] = { ...updated[idx], indirizzo: editDraft.indirizzo, cap: editDraft.cap, citta: editDraft.citta, lat: undefined, lng: undefined };
    const geocoded = await geocodeTask(updated[idx]);
    updated[idx] = geocoded;
    setExcelTasks(updated);
    setEditingTaskId(null);
    setGeocodingSingleId(null);
    setDistribution(null); // distribuzione non è più valida
    setUnassignedTasks([]);

    // Persisti nel DB solo se la geocodifica ha avuto successo
    if (geocoded.lat !== undefined && geocoded.lng !== undefined) {
      const { lat, lng } = geocoded;

      // Salva l'indirizzo corretto (quello con cui Nominatim ha trovato le coords)
      await saveManualCorrection(editDraft.indirizzo, editDraft.cap, editDraft.citta, lat, lng);

      // Se l'indirizzo era diverso dall'originale nel file, salva anche l'originale
      // → la prossima volta non compare nemmeno il bottone "Modifica"
      const addressChanged =
        original.indirizzo !== editDraft.indirizzo ||
        original.cap !== editDraft.cap ||
        original.citta !== editDraft.citta;

      if (addressChanged) {
        await saveManualCorrection(original.indirizzo, original.cap, original.citta, lat, lng);
      }
    }
  }, [excelTasks, editDraft]);

  // Toggle operatore selezionato (aggiunge con qty=0, rimuove se già presente)
  const toggleOp = useCallback((operator: MappaOperatorOption) => {
    const base =
      operator.startLat != null && operator.startLng != null
        ? { lat: operator.startLat, lng: operator.startLng }
        : null;

    setSelectedOps((prev) =>
      prev.some((o) => o.id === operator.id)
        ? prev.filter((o) => o.id !== operator.id)
        : [
            ...prev,
            {
              id: operator.id,
              name: operator.displayName,
              qty: 0,
              base,
              startAddress: operator.startAddress,
            },
          ]
    );
  }, []);

  // Aggiorna la quantità di un operatore
  const changeOpQty = useCallback((id: string, qty: number) => {
    setSelectedOps((prev) => prev.map((o) => o.id === id ? { ...o, qty } : o));
  }, []);

  // Distribuisce i task geocodificati tra gli operatori rispettando le quantità
  const distributeToOps = useCallback(() => {
    if (!selectedOps.length) return;
    const geocoded = excelTasks.filter((t) => t.lat != null && t.lng != null);
    if (!geocoded.length) return;

    const { groups, unassigned } = capacityDistributeWithUnassigned(geocoded, selectedOps);
    const result: DistEntry[] = selectedOps.map((op, i) => {
      const grp = groups[i] ?? [];
      const routeRes =
        grp.length >= 1
          ? optimizeRoute(grp, op.base ?? undefined)
          : { orderedTasks: grp, totalDistanceKm: 0, polyline: [] };
      return {
        op: op.name,
        staffId: op.id,
        color: OP_COLORS[i % OP_COLORS.length],
        tasks: routeRes.orderedTasks,
        km: routeRes.totalDistanceKm,
        polyline: routeRes.polyline,
        base: op.base,
        startAddress: op.startAddress,
      };
    });
    setDistribution(result);
    setUnassignedTasks(unassigned);
    setActiveOpIdx(0);
    setRouteMode(false);
    setRouteResult(null);
    setShowOpPicker(false);
    setMovingTaskId(null);

    // ── Controlla conflitti ZTL ─────────────────────────────────────────────
    const conflicts: string[] = [];
    result.forEach(({ op, staffId, tasks }) => {
      tasks.forEach((t) => {
        const ztl = getTaskZtl(t.cap, ztlZones);
        if (!ztl) return;
        const authorized = ztl.authorized_staff_ids.includes(staffId);
        if (!authorized) {
          conflicts.push(`"${op}" non ha il permesso ZTL per ${ztl.name} (${t.indirizzo})`);
        }
      });
    });
    setZtlConflicts(conflicts);
  }, [selectedOps, excelTasks, ztlZones]);

  // Sposta un task da un operatore a un altro e ricalcola le route
  const moveTask = useCallback((taskId: string, fromIdx: number, toIdx: number) => {
    if (!distribution) return;
    const newDist = distribution.map((d) => ({ ...d, tasks: [...d.tasks] }));
    const taskIdx = newDist[fromIdx].tasks.findIndex((t) => t.id === taskId);
    if (taskIdx === -1) return;
    const [task] = newDist[fromIdx].tasks.splice(taskIdx, 1);
    newDist[toIdx].tasks.push(task);

    // Ricalcola route per i due operatori coinvolti
    [fromIdx, toIdx].forEach((i) => {
      const grp = newDist[i].tasks;
      if (grp.length >= 1) {
        const res = optimizeRoute(grp, newDist[i].base ?? undefined);
        newDist[i] = { ...newDist[i], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline };
      } else {
        newDist[i] = { ...newDist[i], km: 0, polyline: [] };
      }
    });

    setDistribution(newDist);
    setMovingTaskId(null);
  }, [distribution]);

  const assignUnassignedTask = useCallback((taskId: string, toIdx: number) => {
    if (!distribution) return;
    const task = unassignedTasks.find((entry) => entry.id === taskId);
    if (!task) return;

    const newDist = distribution.map((d) => ({ ...d, tasks: [...d.tasks] }));
    newDist[toIdx].tasks.push(task);

    const grp = newDist[toIdx].tasks;
    if (grp.length >= 1) {
      const res = optimizeRoute(grp, newDist[toIdx].base ?? undefined);
      newDist[toIdx] = { ...newDist[toIdx], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline };
    } else {
      newDist[toIdx] = { ...newDist[toIdx], km: 0, polyline: [] };
    }

    setDistribution(newDist);
    setUnassignedTasks((prev) => prev.filter((entry) => entry.id !== taskId));
    setActiveOpIdx(toIdx);
    setMovingTaskId(null);
  }, [distribution, unassignedTasks]);

  const hhmmToMin = (s: string): number => {
    if (!s) return 24 * 60 + 1;
    const m = /(\d{2}):(\d{2})/.exec(s);
    if (!m) return 24 * 60 + 1;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };

  const exportDistribution = useCallback(async () => {
    if (!distribution) return;

    try {
      // 1. Carica il template rapportino
      const tplRes = await fetch('/templates/RAPPORTINO_ATT_CLIENTELA.xlsx');
      if (!tplRes.ok) throw new Error('Template RAPPORTINO_ATT_CLIENTELA.xlsx non trovato in /public/templates/');
      const tplBuf = await tplRes.arrayBuffer();

      const tplWb = new ExcelJS.Workbook();
      await tplWb.xlsx.load(tplBuf);

      const base = tplWb.worksheets[0];
      if (!base) throw new Error('Foglio template non valido.');
      base.name = '__TEMPLATE__';

      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

      // 2. Un foglio per operatore (clonato dal template)
      for (const { op, tasks } of distribution) {
        const sheetName = sanitizeSheetName(op).slice(0, 31);
        const ws = cloneFromTemplate(base, sheetName, tplWb);
        prepareReportSheet(ws);

        // Intestazioni header template (B2 = data, B4 = operatore)
        ws.getCell('B2').value = dateStr;
        ws.getCell('B4').value = op;

        // Riga 6 — intestazioni colonne (16 colonne):
        // A=NOMINATIVO, B=MATRICOLA, C=PDR, D=VIA, E=COMUNE, F=CAP,
        // G=RECAPITO, H=ATTIVITA', I=ACCESSIBILITA', J=FASCIA ORARIA, K=ORDINE,
        // L=ATT/CESS, M=CAMBIO, N=MINI BAG, O=RG STOP, P=ASSENTE
        const hrow = ws.getRow(6);
        [
          'NOMINATIVO',
          'MATRICOLA',
          'PDR',
          'ODSIN',
          'VIA',
          'COMUNE',
          'CAP',
          'RECAPITO',
          "ATTIVITA'",
          "ACCESSIBILITA'",
          'FASCIA ORARIA',
          'ORDINE',
          'ATT/CESS',
          'CAMBIO',
          'MINI BAG',
          'RG STOP',
          'ASSENTE',
        ].forEach((t, i) => { hrow.getCell(i + 1).value = t; });
        hrow.commit();

        // 3. Righe dati — ordinate per fascia oraria
        // Esclude tutti i record con codice S-AI-051 (case-insensitive)
        const filtered = tasks.filter((t) => {
          const codice = (t.codice ?? '').toString().trim();
          return !/S-AI-051/i.test(codice);
        });

        const sorted = [...filtered].sort(
          (a, b) => hhmmToMin(a.fascia_oraria) - hhmmToMin(b.fascia_oraria)
        );

        sorted.forEach((t, idx) => {
          const rr = ws.getRow(7 + idx);
          const pdrRaw = t.odl || '';
          rr.getCell(1).value = t.nominativo ?? '';
          rr.getCell(2).value = t.matricola ?? '';
          rr.getCell(3).value = pdrRaw ? `00${pdrRaw}` : '';
          rr.getCell(4).value = t.odsin ?? '';
          rr.getCell(5).value = t.indirizzo;
          rr.getCell(6).value = t.citta;
          rr.getCell(7).value = t.cap;
          rr.getCell(8).value = t.recapito ?? '';
          rr.getCell(9).value = t.attivita ?? '';
          rr.getCell(10).value = t.accessibilita ?? '';
          rr.getCell(11).value = extractReportTime(t.fascia_oraria || '');
          rr.getCell(11).numFmt = '@';
          rr.getCell(12).value = idx + 1; // ORDINE: numero progressivo
          rr.getCell(13).value = ''; // ATT/CESS
          rr.getCell(14).value = ''; // CAMBIO
          rr.getCell(15).value = ''; // MINI BAG
          rr.getCell(16).value = ''; // RG STOP
          rr.getCell(17).value = ''; // ASSENTE
          rr.commit();
        });

        // Auto-larghezza colonne dati (17 colonne)
        for (let c = 1; c <= 17; c++) {
          let maxLen = 8;
          for (let r = 6; r < 7 + sorted.length; r++) {
            const v = ws.getRow(r).getCell(c).value as any;
            const s = v == null ? '' : String(v?.text ?? v);
            maxLen = Math.max(maxLen, s.length + 2);
          }
          ws.getColumn(c).width = Math.min(60, maxLen);
        }
      }

      // 4. Scarica
      const buf = await tplWb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `RAPPORTINI_MAPPA_${today.toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    } catch (err: any) {
      alert(err?.message || 'Errore durante la generazione del rapportino.');
    }
  }, [distribution]);

  const downloadTemplate = useCallback(() => {
    const headers = [
      'CO', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE',
      'Tipo OdL(CdL)/Servizio', 'Fascia Appuntamento/Blocco',
      'PdR / Impianto', 'Tempo Esecuzione', 'Num Risorse',
    ];
    const examples = [
      ['FIRENZE', '10570366', '20043151148', 'VIA MOLINA 4', '50013', 'CAMPI BISENZIO', 'S-PR-007', '08:00-10:00', '00594202203925', '30', '1'],
      ['FIRENZE', '10529574', '20043043524', 'VIA DEI MALCONTENTI 1', '50122', 'FIRENZE', 'S-PR-053', '08:00-10:00', '00594201242775', '30', '1'],
      ['ROMA', '20100001', '30012345678', 'VIA NAZIONALE 10', '00184', 'ROMA', 'S-MR-002', '10:00-12:00', '00596100174001', '15', '2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    ws['!cols'] = [8, 10, 16, 30, 8, 20, 20, 22, 18, 8, 8].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export Dati');
    XLSX.writeFile(wb, 'template_mappa_operatori.xlsx');
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header + filtri */}
      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xl font-semibold">Pinifica indirizzi</div>
            <div className="text-sm text-[var(--brand-text-muted)]">
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!excelMode && (
              <>
                <select
                  value={territoryFilter}
                  onChange={(e) => setTerritoryFilter(e.target.value)}
                  className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Tutti i territori</option>
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>

                <select
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value)}
                  className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Tutti i giorni</option>
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={onlyRep} onChange={(e) => setOnlyRep(e.target.checked)} />
                  Solo reperibili
                </label>

                <button
                  type="button"
                  onClick={() => { setTerritoryFilter(''); setDayFilter(''); setOnlyRep(false); setRouteMode(false); }}
                  className="rounded-lg border border-[var(--brand-border)] bg-white px-3 py-1.5 text-sm"
                >
                  Azzera
                </button>
              </>
            )}

            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

            {!excelMode && (
              <button
                type="button"
                onClick={downloadTemplate}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                title="Scarica il template Excel da compilare"
              >
                Scarica Template
              </button>
            )}

            {!excelMode ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                Carica Excel
              </button>
            ) : (
              <button
                type="button"
                onClick={clearExcel}
                className="rounded-lg border border-amber-400 bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
              >
                Chiudi Excel
              </button>
            )}

            {/* Percorso ottimale — nascosto se è attiva la distribuzione */}
            {!distribution && (() => {
              const canRoute = excelMode ? excelGeocoded >= 2 : rowsWithCoords.length >= 2;
              return (
                <button
                  type="button"
                  onClick={() => setRouteMode((v) => !v)}
                  disabled={!canRoute}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    routeMode
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-[var(--brand-border)] bg-white text-[var(--brand-text-main)] hover:bg-blue-50'
                  } disabled:opacity-40`}
                >
                  Percorso ottimale
                </button>
              );
            })()}
          </div>
        </div>

        {/* Barra stato Excel + operatori */}
        {excelMode && (
          <div className="mt-3 space-y-2">
            {/* Riga geocodifica */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-semibold text-amber-900">{excelTasks.length}</span>
                  <span className="text-amber-700"> attività da Excel</span>
                  {excelGeocoded > 0 && (
                    <span className="ml-2 text-amber-600">· {excelGeocoded} geocodificate</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isGeocoding ? (
                    <>
                      <span className="text-xs text-amber-700">
                        {geocodingProgress!.done}/{geocodingProgress!.total}
                      </span>
                      <button
                        type="button"
                        onClick={() => { geocodingActiveRef.current = false; setGeocodingProgress(null); }}
                        className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800"
                      >
                        Interrompi
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={startGeocoding}
                      disabled={excelTasks.length === 0}
                      className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-40"
                    >
                      {excelGeocoded > 0 ? 'Riprendi geocodifica' : 'Geocodifica e mostra'}
                    </button>
                  )}
                </div>
              </div>
              {isGeocoding && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${(geocodingProgress!.done / geocodingProgress!.total) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Pannello distribuzione operatori */}
            {excelGeocoded >= 2 && !isGeocoding && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                {/* Intestazione + toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Distribuisci tra operatori</span>
                  <button
                    type="button"
                    onClick={() => setShowOpPicker((v) => !v)}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    {showOpPicker ? 'Chiudi -' : 'Seleziona +'}
                  </button>
                </div>

                {/* Pannello selezione — inline, nessun absolute */}
                {showOpPicker && (
                  <div className="mt-2 space-y-2">
                    {availableOperators.length > 0 ? (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {availableOperators.map((operator) => {
                          const selIdx = selectedOps.findIndex((o) => o.id === operator.id);
                          const checked = selIdx !== -1;
                          return (
                            <label key={operator.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white">
                              <input type="checkbox" checked={checked} onChange={() => toggleOp(operator)} className="accent-blue-600" />
                              <span className="truncate text-xs text-gray-800">{operator.displayName}</span>
                              {checked && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OP_COLORS[selIdx % OP_COLORS.length] }} />}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Nessun operatore valido nel cronoprogramma per questo periodo.</p>
                    )}
                  </div>
                )}

                {/* Tabella operatori selezionati con quantità */}
                {selectedOps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Operatore</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 text-right">N. interventi</span>
                      <span />
                      {selectedOps.map((op, i) => (
                        <>
                          <div key={op.id + '-name'} className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: OP_COLORS[i % OP_COLORS.length] }} />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-gray-800">{op.name}</div>
                              {op.startAddress && (
                                <div className="truncate text-[10px] text-gray-400">{op.startAddress}</div>
                              )}
                            </div>
                          </div>
                          <input
                            key={op.id + '-qty'}
                            type="number"
                            min={0}
                            value={op.qty || ''}
                            onChange={(e) => changeOpQty(op.id, parseInt(e.target.value, 10) || 0)}
                            placeholder="auto"
                            className="w-16 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-right"
                          />
                          <button
                            key={op.id + '-rm'}
                            type="button"
                            onClick={() => setSelectedOps((prev) => prev.filter((o) => o.id !== op.id))}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >
                            ×
                          </button>
                        </>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400">Lascia vuoto per distribuzione automatica uguale.</p>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={distributeToOps} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                        {selectedOps.length === 1 ? 'Assegna' : 'Distribuisci'}
                      </button>
                      {distribution && (
                        <>
                          <button type="button" onClick={exportDistribution} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">
                            Esporta Excel
                          </button>
                          <button type="button" onClick={() => { setDistribution(null); setUnassignedTasks([]); setZtlConflicts([]); }} className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                            Azzera
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats supabase */}
        {!excelMode && (
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {[
              { label: 'Assegnazioni filtrate', value: stats.total },
              { label: 'Operatori unici', value: stats.staff },
              { label: 'Reperibili', value: stats.reperibili },
              { label: 'Su mappa', value: stats.inMap },
              { label: 'Senza coordinate', value: stats.missing },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
                <div className="text-xs text-[var(--brand-text-muted)]">{label}</div>
                <div className="text-lg font-semibold text-[var(--brand-primary)]">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Banner conflitti ZTL */}
      {ztlConflicts.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-900">
              ⚠ {ztlConflicts.length} conflitt{ztlConflicts.length === 1 ? 'o' : 'i'} ZTL
            </span>
            <button
              type="button"
              onClick={() => setZtlConflicts([])}
              className="ml-auto text-xs text-amber-600 hover:text-amber-800"
            >
              Chiudi
            </button>
          </div>
          <ul className="space-y-1">
            {ztlConflicts.map((c, i) => (
              <li key={i} className="text-xs text-amber-800">• {c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            Usa &quot;Sposta&quot; per riassegnare le attività ZTL agli operatori autorizzati.
          </p>
        </div>
      )}

      {/* Mappa + pannello laterale */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm">
          <div ref={mapRef} className="h-[520px] w-full rounded-2xl" />
        </div>

        <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-sm overflow-y-auto max-h-[540px]">
          {/* ── Distribuzione operatori ── */}
          {excelMode && distribution ? (
            <>
              {/* Tab operatori */}
              <div className="mb-3 flex flex-wrap gap-1">
                {distribution.map((d, i) => (
                  <button
                    key={d.staffId}
                    type="button"
                    onClick={() => setActiveOpIdx(i)}
                    className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition"
                    style={
                      activeOpIdx === i
                        ? { backgroundColor: d.color, color: '#fff' }
                        : { backgroundColor: '#f3f4f6', color: '#374151' }
                    }
                  >
                    {d.op.split(' ')[0]} <span className="opacity-80">({d.tasks.length})</span>
                  </button>
                ))}
              </div>

              {distribution[activeOpIdx] && (() => {
                const { op, color, tasks, km, startAddress } = distribution[activeOpIdx];
                return (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold">{op}</span>
                        {startAddress && (
                          <div className="truncate text-[10px] text-gray-400">Partenza: {startAddress}</div>
                        )}
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {km} km
                      </span>
                    </div>
                      <div className="space-y-1.5">
                        {tasks.map((t, idx) => {
                          const isMoving = movingTaskId === t.id;
                          const isSelected = selectedExcelTaskId === t.id;
                          return (
                            <div
                              key={t.id}
                              ref={(node) => { excelTaskItemRefs.current[t.id] = node; }}
                              className={`rounded-lg border px-2 py-1.5 transition ${
                                isSelected ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-gray-100'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1 text-xs">
                                <div className="truncate font-medium">{t.odl || `#${idx + 1}`}</div>
                                <div className="truncate text-gray-500">{t.indirizzo}{t.citta ? `, ${t.citta}` : ''}</div>
                                {t.fascia_oraria && <div className="text-gray-400">{t.fascia_oraria}</div>}
                              </div>
                              <button
                                type="button"
                                onClick={() => setMovingTaskId(isMoving ? null : t.id)}
                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${isMoving ? 'border-blue-400 bg-blue-100 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600'}`}
                              >
                                Sposta
                              </button>
                            </div>
                            {/* Selettore operatore destinazione */}
                            {isMoving && (
                              <div className="mt-1.5 flex flex-wrap gap-1 border-t border-gray-100 pt-1.5">
                                <span className="text-[10px] text-gray-400 w-full">Sposta a:</span>
                                {distribution!.map((d, di) => {
                                  if (di === activeOpIdx) return null;
                                  const ztl = getTaskZtl(t.cap, ztlZones);
                                  const blocked = ztl !== null && !ztl.authorized_staff_ids.includes(d.staffId);
                                  const targetCap = 0;
                                  const capReached = false;
                                  const disabled = blocked;
                                  return (
                                    <button
                                      key={d.staffId}
                                      type="button"
                                      onClick={() => !blocked && moveTask(t.id, activeOpIdx, di)}
                                      disabled={blocked}
                                      title={
                                        blocked
                                          ? `${d.op} non ha il permesso ZTL per ${ztl!.name}`
                                          : capReached
                                            ? `${d.op} ha già raggiunto il limite di ${targetCap} attività`
                                            : undefined
                                      }
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white transition ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80'}`}
                                      style={{ backgroundColor: d.color }}
                                    >
                                      {d.op} ({d.tasks.length}) {blocked ? '🔒' : ''}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {unassignedTasks.length > 0 && (
                      <div className="mt-4 border-t border-amber-200 pt-3">
                        <div className="mb-2 text-sm font-semibold text-amber-800">
                          Non assegnate ({unassignedTasks.length})
                        </div>
                        <div className="space-y-1.5">
                          {unassignedTasks.map((t, idx) => {
                            const isSelected = selectedExcelTaskId === t.id;
                            const isMoving = movingTaskId === t.id;
                            return (
                              <div
                                key={t.id}
                                ref={(node) => { excelTaskItemRefs.current[t.id] = node; }}
                                className={`rounded-lg border px-2 py-1.5 text-xs ${
                                  isSelected
                                    ? 'border-amber-400 bg-amber-100 shadow-sm'
                                    : 'border-amber-200 bg-amber-50'
                                }`}
                              >
                                <div
                                  className="flex cursor-pointer items-start gap-1.5"
                                  onClick={() => focusExcelTask(t.id)}
                                >
                                  <span className="mt-0.5 shrink-0 text-[9px] font-bold text-amber-600">{idx + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      <span className="truncate font-medium">{t.odl || `Task ${idx + 1}`}</span>
                                      {isSelected && (
                                        <span className="shrink-0 rounded-full border border-amber-300 bg-white px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                          Selezionato
                                        </span>
                                      )}
                                    </div>
                                    <div className="truncate text-gray-500">{t.indirizzo}{t.citta ? ` · ${t.citta}` : ''}</div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMovingTaskId(isMoving ? null : t.id);
                                      }}
                                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
                                        isMoving
                                          ? 'border-blue-400 bg-blue-100 text-blue-700'
                                          : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600'
                                      }`}
                                    >
                                      Sposta
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEdit(t);
                                      }}
                                      className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                                      title="Correggi indirizzo e rigenera coordinate"
                                    >
                                      Correggi
                                    </button>
                                  </div>
                                </div>
                                {isMoving && (
                                  <div className="mt-1.5 flex flex-wrap gap-1 border-t border-amber-200 pt-1.5">
                                    <span className="w-full text-[10px] text-amber-700">Sposta a:</span>
                                    {distribution!.map((d, di) => {
                                      const ztl = getTaskZtl(t.cap, ztlZones);
                                      const blocked = ztl !== null && !ztl.authorized_staff_ids.includes(d.staffId);
                                      return (
                                        <button
                                          key={d.staffId}
                                          type="button"
                                          onClick={() => !blocked && assignUnassignedTask(t.id, di)}
                                          disabled={blocked}
                                          title={
                                            blocked
                                              ? `${d.op} non ha il permesso ZTL per ${ztl!.name}`
                                              : undefined
                                          }
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white transition ${
                                            blocked ? 'cursor-not-allowed opacity-30' : 'hover:opacity-80'
                                          }`}
                                          style={{ backgroundColor: d.color }}
                                        >
                                          {d.op} ({d.tasks.length}){blocked ? ' ZTL' : ''}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          ) : routeMode && routeResult ? (
            /* ── Percorso ottimale singolo ── */
            <>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Percorso ottimale</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {routeResult.totalDistanceKm} km
                </span>
              </div>
              <div className="space-y-2">
                {routeResult.orderedTasks.map((task, idx) => {
                  const row = rowById.get(task.id);
                  const op = (task as Task & { _operatore?: string })._operatore;
                  return (
                    <div key={task.id} className="flex items-start gap-2 rounded-xl border border-[var(--brand-border)] p-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {row?.displayName ?? op ?? task.odl ?? task.id}
                        </div>
                        <div className="text-xs text-[var(--brand-text-muted)]">
                          {row?.territoryName ?? [task.indirizzo, task.citta].filter(Boolean).join(', ') ?? '-'}
                        </div>
                        {task.fascia_oraria && (
                          <div className="text-xs text-[var(--brand-text-muted)]">{task.fascia_oraria}</div>
                        )}
                        {row && (
                          <div className="mt-0.5 flex items-center gap-2 text-xs">
                            <span>{row.day}</span>
                            {row.reperibile && (
                              <span className="rounded border border-red-200 bg-red-100 px-1 text-[10px] font-bold text-red-700">REP</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : excelMode ? (
            /* ── Lista attività Excel (con edit per non geocodificate) ── */
            <>
              <div className="sticky top-0 z-10 mb-3 space-y-2 border-b border-[var(--brand-border)] bg-white pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-amber-800">Attivita da Excel</div>
                  <span className="text-[10px] font-medium text-gray-400">
                    {filteredExcelTasks.length}/{excelTasks.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setExcelOnlyManualAction((value) => !value)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                      excelOnlyManualAction
                        ? 'border-amber-300 bg-amber-100 text-amber-800'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-amber-200 hover:text-amber-700'
                    }`}
                  >
                    Solo da correggere ({excelNeedsManualCount})
                  </button>
                  {excelOnlyManualAction && (
                    <button
                      type="button"
                      onClick={() => setExcelOnlyManualAction(false)}
                      className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                    >
                      Reset filtri
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Operatori coinvolti</div>
                  {excelOperators.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {excelOperators.map((name) => (
                        <span
                          key={name}
                          className="max-w-full truncate rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                          title={name}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-400">Nessun operatore selezionato.</div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {filteredExcelTasks.map((t, idx) => {
                  const hasCoords = t.lat != null && t.lng != null;
                  const op = (t as Task & { _operatore?: string })._operatore;
                  const isEditing = editingTaskId === t.id;
                  const isSaving = geocodingSingleId === t.id;
                  const isSelected = selectedExcelTaskId === t.id;

                  return (
                    <div
                      key={t.id}
                      ref={(node) => { excelTaskItemRefs.current[t.id] = node; }}
                      className={`rounded-lg border px-2 py-1.5 text-xs ${
                        isSelected
                          ? 'border-amber-400 bg-amber-100 shadow-sm'
                          : hasCoords
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      {isEditing ? (
                        /* Form modifica indirizzo */
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Modifica indirizzo</div>
                          <input
                            type="text"
                            value={editDraft.indirizzo}
                            onChange={(e) => setEditDraft((d) => ({ ...d, indirizzo: e.target.value }))}
                            placeholder="Indirizzo..."
                            className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs"
                          />
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={editDraft.cap}
                              onChange={(e) => setEditDraft((d) => ({ ...d, cap: e.target.value }))}
                              placeholder="CAP"
                              className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs"
                            />
                            <input
                              type="text"
                              value={editDraft.citta}
                              onChange={(e) => setEditDraft((d) => ({ ...d, citta: e.target.value }))}
                              placeholder="Città..."
                              className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs"
                            />
                          </div>
                          <div className="flex gap-1 pt-0.5">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={(e) => {
                                e.stopPropagation();
                                void saveAndGeocode(t.id);
                              }}
                              className="flex-1 rounded bg-amber-500 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                              {isSaving ? 'Geocodifica...' : 'Salva e geocodifica'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTaskId(null);
                              }}
                              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Vista normale */
                        <div
                          className="flex cursor-pointer items-start gap-1.5"
                          onClick={() => focusExcelTask(t.id)}
                        >
                          <span className="mt-0.5 shrink-0 text-[9px] font-bold text-amber-600">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate font-medium">{op || t.odl || `Task ${idx + 1}`}</span>
                              {isSelected && (
                                <span className="shrink-0 rounded-full border border-amber-300 bg-white px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                  Selezionato
                                </span>
                              )}
                              {hasCoords && (
                                <span className="shrink-0 text-[9px] text-green-600">✓</span>
                              )}
                              {(() => {
                                const ztl = getTaskZtl(t.cap, ztlZones);
                                return ztl ? (
                                  <span className="shrink-0 rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 uppercase tracking-wide">
                                    ZTL · {ztl.name}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <div className="truncate text-gray-500">{t.indirizzo}{t.citta ? ` · ${t.citta}` : ''}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(t);
                            }}
                            className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                            title={hasCoords ? 'Correggi indirizzo e rigenera coordinate' : 'Modifica indirizzo e riprova'}
                          >
                            {hasCoords ? 'Correggi' : 'Modifica'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredExcelTasks.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                    Nessun indirizzo corrisponde ai filtri correnti.
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Supabase: operatori senza coordinate ── */
            <>
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
                          <span className="rounded border border-red-200 bg-red-100 px-1 text-[10px] font-bold text-red-700">REP</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--brand-text-muted)]">Tutti gli operatori hanno coordinate.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
