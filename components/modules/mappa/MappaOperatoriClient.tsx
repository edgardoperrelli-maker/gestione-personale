'use client';

import type * as Leaflet from 'leaflet';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTerritoryStyle } from '@/lib/territoryColors';
import { isTerritoryValidOnDay } from '@/lib/territories';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { geocodeTask, optimizeRoute, optimizeRouteByFascia, parseExcelToTasks, buildEsecutorePins } from '@/utils/routing';
import { appendTaskToOperator, removeTaskFromOperator, moveAllTasksToOperator, moveTaskToOperator, ensureOperatorInDistribution, alignAndAppendTask } from '@/utils/mappa/appendTask';
import { identitaIntervento } from '@/lib/interventi/planInterventiForPiano';
import { cercaInterventi } from '@/utils/mappa/cercaInterventi';
import type { OperatorBase, RouteResult, Task } from '@/utils/routing';
import { buildDistribuzionePayload } from '@/lib/interventi/mappaInterventi';
import { formatEtaMin } from '@/utils/routing/timeEngine';
import type { ScheduleEntry } from '@/utils/routing';
import type { Territory } from '@/types';
import { applyManualAssignments, type ManualRule } from '@/utils/routing/manualAssignments';
import ManualAssignmentsModal from './ManualAssignmentsModal';
import ManualTaskModal, { type ManualTaskData } from '@/components/modules/mappa/ManualTaskModal';
import { type RapportinoStato, statoBadge, whatsappHref } from '@/utils/rapportini/links';
import { resolveInfoCampi, valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { taskToVoce, type TemplateCampo } from '@/utils/rapportini/buildVoci';
import { mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { buildRiepilogoConferma } from '@/utils/rapportini/riepilogoConferma';
import { pianoHaRisanamento, risolviTemplateRisanamento } from '@/lib/risanamento/templateRisanamento';
import { isAssenzaIntera, labelOrario, type Disponibilita } from '@/lib/disponibilita';
import { preparaBanda, posizionaBanda } from '@/lib/rapportini/bandaRapportino';
import DatePicker from '@/components/ui/DatePicker';
import PhaseStrip from './PhaseStrip';
import { computePlanningPhase } from '@/lib/mappa/planningPhase';
import MenuDropdown, { type MenuItem } from './MenuDropdown';

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

interface Allegato10Fields {
  NOME_UTENTE:  string;
  STRADA:       string;
  ODS:          string;
  NOME_LOCALITA:string;
  PDR:          string;
  NUMERO_SERIE: string;
  ESECUTORE:    string;
  DATA:         string;
  RECAPITO:     string;
}

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
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  /** Giorni ISO (YYYY-MM-DD) in cui è reperibile nel range caricato */
  reperibileDates: string[];
};

type Props = {
  rows: MappaStaffRow[];
  operatorOptions: MappaOperatorOption[];
  territories: Territory[];
  dateFrom: string;
  dateTo: string;
  ztlZones?: ZtlZoneInfo[];
  allegato10ActiveCodes?: string[];
  initialPianoId?: string;
  initialDistribution?: DistEntry[];
  initialPlanningDate?: string;
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
  schedule?: ScheduleEntry[];
};
type OpConfig = { id: string; name: string; qty: number; base: OperatorBase | null; startAddress: string | null };
type ExcelMarker = Leaflet.Marker | Leaflet.CircleMarker;
type CapacityDistributionResult = { groups: Task[][]; unassigned: Task[] };

// ─── Palette colori operatori ────────────────────────────────────────────────

// Palette sobria e armonizzata: 8 toni desaturati distinti, leggibili su chiaro e scuro.
// L'ordine è funzionale (index → operatore: tab + marker + polyline condividono il colore).
const OP_COLORS = [
  '#3E7CB1', // blu
  '#3F9D8E', // teal
  '#5B9F5B', // verde
  '#C9A14A', // ambra
  '#C46B7A', // rosa
  '#8071B0', // viola
  '#6B7A8F', // ardesia
  '#C08552', // arancio
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

// ─── Allegato 10 Helper Functions ────────────────────────────────────────────

function detectTerritory(cap: string): 'lazio' | 'firenze' {
  const prefix = parseInt(cap.trim().slice(0, 2), 10);
  if (!isNaN(prefix) && prefix >= 50 && prefix <= 59) return 'firenze';
  return 'lazio';
}

// ─── replaceMergeField CORRETTA (nessuna regex [\s\S]) ───────────────────────
function replaceMergeField(xml: string, fieldName: string, value: string): string {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let result = xml;
  let searchFrom = 0;

  while (true) {
    const instrIdx = result.indexOf(`MERGEFIELD ${fieldName}`, searchFrom);
    if (instrIdx < 0) break;

    const sepIdx = result.indexOf('fldCharType="separate"', instrIdx);
    if (sepIdx < 0 || sepIdx > instrIdx + 3000) { searchFrom = instrIdx + 1; continue; }

    const tStart = result.indexOf('<w:t', sepIdx);
    if (tStart < 0 || tStart > sepIdx + 500) { searchFrom = instrIdx + 1; continue; }

    const tTagEnd = result.indexOf('>', tStart) + 1;
    const tClose  = result.indexOf('</w:t>', tTagEnd);
    if (tClose < 0 || tClose > tTagEnd + 300) { searchFrom = instrIdx + 1; continue; }

    result = result.slice(0, tTagEnd) + escaped + result.slice(tClose);
    searchFrom = tTagEnd + escaped.length;
  }

  return result;
}

// ─── Cache template (1 fetch per sessione) ───────────────────────────────────
interface TemplateCache { zip: JSZip; xml: string; }
let _lazioCache: TemplateCache | null = null;
let _firenzeCache: TemplateCache | null = null;

async function getLazioTemplate(): Promise<TemplateCache> {
  if (_lazioCache) return _lazioCache;
  const res = await fetch('/templates/ALLEGATO_10_LAZIO.docx');
  if (!res.ok) throw new Error('Template ALLEGATO_10_LAZIO.docx non trovato in /public/templates/');
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  _lazioCache = { zip, xml };
  return _lazioCache;
}

async function getFirenzeTemplate(): Promise<TemplateCache> {
  if (_firenzeCache) return _firenzeCache;
  const res = await fetch('/templates/ALLEGATO_10_FIRENZE.docx');
  if (!res.ok) throw new Error('Template ALLEGATO_10_FIRENZE.docx non trovato in /public/templates/');
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  _firenzeCache = { zip, xml };
  return _firenzeCache;
}

// ─── Fill XML (solo string manipulation, zero I/O) ───────────────────────────
function fillLazioXml(templateXml: string, fields: Allegato10Fields): string {
  let xml = templateXml;
  for (const [field, value] of Object.entries(fields)) {
    xml = replaceMergeField(xml, field, value);
  }
  return xml;
}

function fillFirenzeXml(templateXml: string, fields: Allegato10Fields): string {
  const map: Record<string, string> = {
    // ── Dati cliente ─────────────────────────────────────────────────────────
    '{{NOME_UTENTE}}':          fields.NOME_UTENTE,
    '{{STRADA}}':               fields.STRADA,
    '{{NOME_LOCALITA}}':        fields.NOME_LOCALITA,
    '{{CAMPO_28}}':             '',                   // continuazione Indirizzo
    '{{CAMPO_14}}':             fields.NOME_LOCALITA, // primo blank "Comune:"
    '{{CAMPO_9}}':              '',
    '{{CAMPO_57}}':             '',
    '{{RECAPITO}}':             fields.RECAPITO,
    '{{CAMPO_87}}':             '',                   // 2a riga Telefono
    '{{PDR}}':                  fields.PDR,
    '{{CAMPO_76}}':             '',                   // 2a riga PDR
    // ── Campi pratiche ───────────────────────────────────────────────────────
    '{{NUMERO_PRATICA}}':       fields.ODS,           // Numero pratica → ODS
    '{{CAMPO_11}}':             '',                   // Numero richiesta (inizio)
    '{{ODS}}':                  fields.DATA,          // Data richiesta → DATA intervento
    '{{DATA}}':                 '',                   // Numero richiesta → vuoto
    // ── Esito intervento ─────────────────────────────────────────────────────
    '{{ESEGUITO_DATA}}':        fields.DATA,          // Eseguito il → DATA
    '{{ADDETTO}}':              fields.ESECUTORE,     // Addetto → operatore mappa
    // ── Contatore ────────────────────────────────────────────────────────────
    '{{MATRICOLA_ESISTENTE}}':  fields.NUMERO_SERIE,  // Matricola contatore esistente
  };
  let xml = templateXml;
  for (const [ph, val] of Object.entries(map)) {
    const esc = val.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    xml = xml.replaceAll(ph, esc);
  }
  return xml;
}

// ─── Body concat (nessuna API merge) ─────────────────────────────────────────
function extractBodyContent(xml: string): string {
  const bodyStart = xml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyEnd   = xml.lastIndexOf('</w:body>');
  const body      = xml.slice(bodyStart, bodyEnd);
  const lastSect  = body.lastIndexOf('<w:sectPr');
  return lastSect >= 0 ? body.slice(0, lastSect) : body;
}

async function buildCombinedDocx(filledXmls: string[], tpl: TemplateCache): Promise<Uint8Array> {
  const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const { zip: tplZip, xml: tplXml } = tpl;

  const bodyOuter  = tplXml.slice(tplXml.indexOf('<w:body>'), tplXml.lastIndexOf('</w:body>') + '</w:body>'.length);
  const sectIdx    = bodyOuter.lastIndexOf('<w:sectPr');
  const sectPr     = sectIdx >= 0 ? bodyOuter.slice(sectIdx, bodyOuter.lastIndexOf('</w:body>')) : '';

  const combined   = filledXmls.map(extractBodyContent).join(PAGE_BREAK);
  const bodyStart  = tplXml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyEnd    = tplXml.lastIndexOf('</w:body>');
  const finalXml   = tplXml.slice(0, bodyStart) + combined + sectPr + tplXml.slice(bodyEnd);

  const out = new JSZip();
  await Promise.all(Object.keys(tplZip.files).map(async (name) => {
    const f = tplZip.files[name];
    if (f.dir) return;
    out.file(name, name === 'word/document.xml' ? finalXml : await f.async('uint8array'));
  }));
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function buildAllegato10FieldsFromTask(t: Task, operatorName: string, dateStr: string): Allegato10Fields {
  return {
    NOME_UTENTE:   String(t.nominativo ?? '').trim(),
    STRADA:        String(t.indirizzo ?? '').trim(),
    ODS:           String(t.odl ?? '').trim(),
    NOME_LOCALITA: String(t.citta ?? '').trim(),
    PDR:           String(t.pdr ?? '').trim(),
    NUMERO_SERIE:  String(t.matricola ?? '').trim(),
    ESECUTORE:     operatorName,
    DATA:          dateStr,
    RECAPITO:      String(t.recapito ?? '').trim(),
  };
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function isoTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function isoToDisplay(iso: string): string {
  const [y, m, g] = iso.split('-');
  return `${g}/${m}/${y}`;
}

// ─── Componente principale ───────────────────────────────────────────────────

export default function MappaOperatoriClient({ rows, operatorOptions, territories, dateFrom, dateTo, ztlZones = [], allegato10ActiveCodes = [], initialPianoId, initialDistribution, initialPlanningDate }: Props) {
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
  const [sorgente, setSorgente] = useState<'excel' | 'interventi'>('excel');
  const [excelOnlyManualAction, setExcelOnlyManualAction] = useState(false);

  // Modifica task non geocodificati
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedExcelTaskId, setSelectedExcelTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editDraft, setEditDraft] = useState({ indirizzo: '', cap: '', citta: '' });
  const [geocodingSingleId, setGeocodingSingleId] = useState<string | null>(null);

  // Distribuzione operatori
  const [showOpPicker, setShowOpPicker] = useState(false);
  const [selectedOps, setSelectedOps] = useState<OpConfig[]>([]);
  const [manualRules, setManualRules] = useState<ManualRule[]>([]);
  const [operatorLocks, setOperatorLocks] = useState<Record<string, boolean>>({});
  const [operatorFreeLane, setOperatorFreeLane] = useState<Record<string, boolean>>({});
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [distribution, setDistribution] = useState<DistEntry[] | null>(
    initialDistribution ?? null
  );
  // Identità degli interventi GIÀ annullati eliminati dall'utente: inviate al Salva per
  // cancellare anche l'intervento canonico (i terminali sono preservati dalla rigenerazione).
  const [eliminatiAnnullati, setEliminatiAnnullati] = useState<string[]>([]);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [activeOpIdx, setActiveOpIdx] = useState(0);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [movingAllOpen, setMovingAllOpen] = useState(false);
  const [planningDate, setPlanningDate] = useState<string>(initialPlanningDate ?? '');
  // Assenze del giorno pianificato: lookup per staff_id
  const [assenzeByStaff, setAssenzeByStaff] = useState<Record<string, Disponibilita>>({});
  const [assenzaMsg, setAssenzaMsg] = useState<string | null>(null);
  const [pianoId, setPianoId] = useState<string | undefined>(initialPianoId);
  const [currentPianoId, setCurrentPianoId] = useState<string | undefined>(initialPianoId);

  // Modalità modifica: quando si riapre un piano salvato
  const isEditMode = !!initialPianoId;

  // ZTL conflicts
  const [ztlConflicts, setZtlConflicts] = useState<string[]>([]);

  // Geocoded appointment tasks
  const [geocodedAppointmentTasks, setGeocodedAppointmentTasks] = useState<Task[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  // Template file states
  const [templateTasks, setTemplateTasks] = useState<Task[]>([]);
  const [templateGeocoding, setTemplateGeocoding] = useState<{done:number;total:number}|null>(null);
  const fileTemplateInputRef = useRef<HTMLInputElement|null>(null);

  // Appointments fetch controller
  const appointmentFetchRef = useRef<AbortController | null>(null);

  // Distribution save states
  const [savingDistribution, setSavingDistribution] = useState(false);
  const [savedDistribution, setSavedDistribution] = useState(false);

  // Auto-assegnazione da colonna Esecutore
  const [esecutorePins, setEsecutorePins] = useState<Record<string, string>>({});
  const [esecutoreWarnings, setEsecutoreWarnings] = useState<string[]>([]);
  const esecutoreAutoDistributedRef = useRef(false);

  // Rapportini inline (editor)
  const [rapStato, setRapStato] = useState<RapportinoStato[]>([]);
  const [rapTemplateId, setRapTemplateId] = useState('');
  const [rapTemplates, setRapTemplates] = useState<Array<{ id: string; nome: string; is_default?: boolean; solo_manuale?: boolean; tipo?: string; active?: boolean; campi?: TemplateCampo[]; info_campi?: TemplateInfoCampo[] }>>([]);
  const [rapGenerating, setRapGenerating] = useState(false);
  const [rapError, setRapError] = useState<string | null>(null);
  const [rapConflicts, setRapConflicts] = useState<Array<{ staff_id: string; staff_name: string | null; territorio: string | null; data: string; submitted: boolean }> | null>(null);
  const [overwriteInviati, setOverwriteInviati] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Setup modale per data e territorio all'apertura
  const [setupDone, setSetupDone] = useState(false);
  const [setupModalDate, setSetupModalDate] = useState('');
  const [setupModalTerritory, setSetupModalTerritory] = useState('');
  const todayIso = useMemo(
    () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),
    []
  );

  useEffect(() => {
    if (setupDone || isEditMode || !setupModalTerritory) return;
    const stillValid = territories.some((territory) =>
      territory.id === setupModalTerritory &&
      isTerritoryValidOnDay(territory, setupModalDate, todayIso)
    );
    if (!stillValid) {
      setSetupModalTerritory('');
    }
  }, [isEditMode, setupDone, setupModalDate, setupModalTerritory, territories, todayIso]);

  // Inizializza modalità quando piano è riaperto dal registro
  useEffect(() => {
    if (!initialDistribution || initialDistribution.length === 0) return;

    // Ricostruisci selectedOps da initialDistribution
    const ops: OpConfig[] = initialDistribution
      .filter((d) => d.op && d.staffId) // Filtra operatori malformati
      .map((d) => ({
        id: d.staffId,
        name: d.op,          // DistEntry usa 'op', OpConfig usa 'name'
        qty: d.tasks.length, // imposta qty uguale ai task assegnati
        base: d.base,
        startAddress: d.startAddress,
      }));

    setSelectedOps(ops);
    setExcelMode(true);
    setActiveOpIdx(0);
    setSavedDistribution(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carica appuntamenti lazy quando planningDate cambia
  useEffect(() => {
    if (!setupDone && !isEditMode) return;
    // Cancel previous fetch if still in progress
    if (appointmentFetchRef.current) {
      appointmentFetchRef.current.abort();
    }

    // Create new AbortController for this fetch
    const controller = new AbortController();
    appointmentFetchRef.current = controller;

    setLoadingAppointments(true);

    const url = territoryFilter
      ? `/api/appointments/mappa?date=${planningDate}&territory_id=${territoryFilter}`
      : `/api/appointments/mappa?date=${planningDate}`;

    fetch(url, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((rows: any[]) => {
        // Only update state if this fetch wasn't cancelled
        if (controller.signal.aborted) return;
        const appointmentTasks: Task[] = (rows ?? []).map((a) => ({
          id: `apt-${a.id}`,
          odl: '',
          indirizzo: a.indirizzo ?? '',
          cap: a.cap ?? '',
          citta: a.citta ?? '',
          priorita: 0,
          fascia_oraria: a.fascia_oraria ?? '',
          lat: a.lat ?? undefined,
          lng: a.lng ?? undefined,
          nominativo: a.nome_cognome ?? undefined,
          isAppointment: true,
          appointmentId: a.id,
          pdr: a.pdr,
          appointmentDate: a.data,
        }));
        setGeocodedAppointmentTasks(appointmentTasks);
      })
      .catch((err: any) => {
        // Ignore AbortError (fetch was cancelled)
        if (err.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        setGeocodedAppointmentTasks([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingAppointments(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [planningDate, territoryFilter, setupDone, isEditMode]);

  // Carica le assenze per la data pianificata
  useEffect(() => {
    if (!planningDate) { setAssenzeByStaff({}); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/disponibilita?data=${planningDate}`);
        if (!res.ok) return;
        const rows = (await res.json()) as Disponibilita[];
        if (!alive || !Array.isArray(rows)) return;
        const m: Record<string, Disponibilita> = {};
        for (const r of rows) m[r.staff_id] = r;
        setAssenzeByStaff(m);
      } catch (e) {
        console.error('Errore fetch disponibilità (mappa):', e);
      }
    })();
    return () => { alive = false; };
  }, [planningDate]);

  // Geocodifica appuntamenti appena caricati
  useEffect(() => {
    let alive = true;

    (async () => {
      const updated = [...geocodedAppointmentTasks];
      for (let i = 0; i < updated.length; i++) {
        const task = updated[i];
        if (task.lat != null && task.lng != null) continue;
        if (!alive) return;
        const result = await geocodeTask(updated[i]);
        updated[i] = result;
        if (alive) setGeocodedAppointmentTasks([...updated]);
      }
    })();
    return () => { alive = false; };
  }, [geocodedAppointmentTasks.length > 0 ? geocodedAppointmentTasks[0]?.id : null]);

  // Inizializza da piano salvato se pianoId è fornito
  useEffect(() => {
    if (!initialDistribution || initialDistribution.length === 0) return;

    // 1. Raccogli tutti i task da tutti gli operatori (de-duplica per id)
    const allRestoredTasks: Task[] = [];
    const seenIds = new Set<string>();
    for (const d of initialDistribution) {
      for (const t of (d.tasks ?? [])) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          allRestoredTasks.push(t);
        }
      }
    }

    // 2. Ripopola excelTasks — i task hanno già lat/lng salvati
    setExcelTasks(allRestoredTasks);

    // 3. Imposta il geocoding progress come completato
    if (allRestoredTasks.length > 0) {
      setGeocodingProgress({ done: allRestoredTasks.length, total: allRestoredTasks.length });
    }

    // 4. Ricostruisci selectedOps da initialDistribution
    const ops: OpConfig[] = initialDistribution.map((d) => ({
      id: d.staffId,
      name: d.op ?? d.staffId ?? 'Operatore',
      qty: d.tasks?.length ?? 0,
      base: d.base ?? null,
      startAddress: d.startAddress ?? null,
    }));
    setSelectedOps(ops);

    // 5. Imposta la distribuzione e la modalità corretta
    setDistribution(initialDistribution);
    setExcelMode(true);
    setActiveOpIdx(0);
    setSavedDistribution(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const planningTerritories = useMemo(() => {
    const targetDate = !setupDone && !isEditMode ? setupModalDate : planningDate;
    const available = territories.filter((territory) =>
      isTerritoryValidOnDay(territory, targetDate, todayIso)
    );

    const preservedId = territoryFilter;
    const preserved = territories.find((territory) => territory.id === preservedId);
    if (preserved && !available.some((territory) => territory.id === preserved.id)) {
      available.push(preserved);
    }

    return available.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  }, [isEditMode, planningDate, setupDone, setupModalDate, setupModalTerritory, territories, territoryFilter, todayIso]);

  const selectedPlanningTerritory = useMemo(() => {
    if (!territoryFilter) return null;
    return territories.find((territory) => territory.id === territoryFilter) ?? null;
  }, [territories, territoryFilter]);

  const scheduledStaffIdsForPlanning = useMemo(() => {
    if (!territoryFilter) return new Set<string>();

    return new Set(
      rows
        .filter((row) => row.day === planningDate && row.territoryId === territoryFilter)
        .map((row) => row.staffId)
        .filter(Boolean)
    );
  }, [planningDate, rows, territoryFilter]);

  const excelOperators = useMemo(() => {
    const names = new Set<string>();
    selectedOps.forEach((op) => {
      const name = op.name?.trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  }, [selectedOps]);

  // Filtra operatori sul territorio selezionato in mappa per il giorno corrente
  const territoryFilteredOperators = useMemo(() => {
    if (!territoryFilter) return availableOperators;
    return availableOperators.filter((operator) => scheduledStaffIdsForPlanning.has(operator.id));
  }, [availableOperators, scheduledStaffIdsForPlanning, territoryFilter]);

  // Operatori NON schedulati nel cronoprogramma di quel territorio/giorno: vanno
  // comunque resi selezionabili (per ridistribuire le righe senza esecutore).
  const altriOperatori = useMemo(() => {
    if (!territoryFilter) return [];
    const sched = new Set(territoryFilteredOperators.map((o) => o.id));
    return availableOperators.filter((o) => !sched.has(o.id));
  }, [availableOperators, territoryFilteredOperators, territoryFilter]);

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

  // Filtra appuntamenti per data pianificazione e territorio
  const filteredAppointmentTasks = useMemo(() => {
    return (geocodedAppointmentTasks ?? []).filter((task) => task.appointmentDate === planningDate);
  }, [geocodedAppointmentTasks, planningDate]);

  // Merge Excel tasks con appointment tasks filtrati per distribuzione
  const allTasks = useMemo(() => {
    return [...excelTasks, ...templateTasks];
  }, [excelTasks, templateTasks]);

  const totalQtyRichiesta = selectedOps.reduce((s,o) => s + (o.qty||0), 0);
  const geocodificati = allTasks.filter(t => t.lat != null && t.lng != null).length;
  const needsSaturazione = totalQtyRichiesta > 0 && geocodificati < totalQtyRichiesta && !!distribution;

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

  const currentPhase = useMemo(
    () =>
      computePlanningPhase({
        setupDone,
        isEditMode,
        totalTasks: allTasks.length,
        appointmentCount: filteredAppointmentTasks.length,
        geocoded: geocodificati,
        isGeocoding,
        hasDistribution: distribution !== null,
        currentPianoId: !!currentPianoId,
      }),
    [setupDone, isEditMode, allTasks.length, filteredAppointmentTasks.length, geocodificati, isGeocoding, distribution, currentPianoId],
  );

  // ─── Lookup supabase ────────────────────────────────────────────────────────

  const rowById = useMemo(() => {
    const m = new Map<string, MappaStaffRow>();
    rowsWithCoords.forEach((r) => m.set(`${r.staffId}-${r.day}`, r));
    return m;
  }, [rowsWithCoords]);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const mapReady = setupDone || isEditMode;

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
    if (!mapReady) return;
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
  }, [mapReady]);

  // Marker Supabase
  useEffect(() => {
    if (!leaflet || !layerRef.current || !mapInstanceRef.current) return;
    const layer = layerRef.current;
    const map = mapInstanceRef.current;
    layer.clearLayers();
    if (excelMode) return;

    // Risolvi i token CSS in valori reali (Leaflet non risolve var() nel JS)
    const css = getComputedStyle(document.documentElement);
    const cReperibile = css.getPropertyValue('--warning').trim() || '#C9A14A';

    const adjusted = applyProximityOffset(rowsWithCoords);
    const bounds: Array<[number, number]> = [];
    adjusted.forEach((row) => {
      if (row.lat === null || row.lng === null) return;
      const style = getTerritoryStyle(row.territoryName);
      const marker = leaflet.circleMarker([row.lat, row.lng], {
        radius: row.reperibile ? 9 : 7,
        color: row.reperibile ? cReperibile : style.band,
        weight: 2,
        fillColor: style.band,
        fillOpacity: 0.35,
      });
      marker.bindPopup(`
        <div style="font-size:12px;line-height:1.4">
          <div style="font-weight:600">${row.displayName}</div>
          ${row.reperibile ? `<span style="color:${cReperibile};font-weight:700">REP</span>` : ''}
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

    // Risolvi i token CSS in valori reali (Leaflet non risolve var() nel JS)
    const css = getComputedStyle(document.documentElement);
    const cOnMarker = css.getPropertyValue('--on-marker').trim() || '#1c2433';
    const cBase = css.getPropertyValue('--brand-text-subtle').trim() || '#6B7A8F';
    const cWarning = css.getPropertyValue('--warning').trim() || '#C9A14A';
    const cWarningStrong = css.getPropertyValue('--status-warn').trim() || '#C9A14A';
    const cViolet = css.getPropertyValue('--brand-violet').trim() || '#8071B0';

    if (distribution && excelMode) {
      // Marker e polyline per-operatore
      const bounds: Array<[number, number]> = [];
      distribution.forEach(({ op, color, tasks, polyline, base, startAddress }, i) => {
        if (base) {
          bounds.push([base.lat, base.lng]);
          const baseIcon = leaflet.divIcon({
            className: '',
            html: `<div style="background:${cBase};color:#fff;border-radius:999px;min-width:22px;height:22px;padding:0 6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">S</div>`,
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
            html: `<div style="background:${color};color:${cOnMarker};border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${idx + 1}</div>`,
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
          color: cWarning,
          weight: 2,
          fillColor: cWarning,
          fillOpacity: 0.45,
        });
        excelMarkersRef.current.set(t.id, marker);
        marker.on('click', () => {
          setSelectedExcelTaskId(t.id);
        });
        marker.bindPopup(`
          <div style="font-size:12px;line-height:1.5">
            <div style="font-weight:600;color:${cWarningStrong}">Non assegnata</div>
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
      // Marker Excel singoli (arancione) + Appuntamenti (viola) filtrati per data
      const bounds: Array<[number, number]> = [];

      // Combina task Excel con appuntamenti della data (già filtrati)
      const tasksToShow = [...excelTasks, ...filteredAppointmentTasks];

      tasksToShow.forEach((t) => {
        if (t.lat == null || t.lng == null) return;
        const isAppt = t.isAppointment;
        const marker = leaflet.circleMarker([t.lat, t.lng], {
          radius: isAppt ? 10 : 7,
          color: isAppt ? cViolet : cWarning,
          weight: isAppt ? 2 : 2,
          fillColor: isAppt ? cViolet : cWarning,
          fillOpacity: isAppt ? 0.55 : 0.45,
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
  }, [leaflet, excelTasks, excelMode, distribution, unassignedTasks, filteredAppointmentTasks]);

  // Polyline percorso supabase / excel singolo
  useEffect(() => {
    if (!leaflet || !routeLayerRef.current || !mapInstanceRef.current) return;
    if (excelMode) return; // gestito dall'effetto unificato Excel
    const rLayer = routeLayerRef.current;
    rLayer.clearLayers();
    if (!routeResult || !routeMode) return;

    const coords = routeResult.polyline.map((p) => [p.lat, p.lng] as [number, number]);
    if (coords.length < 2) return;

    // Risolvi i token CSS in valori reali (Leaflet non risolve var() nel JS)
    const css = getComputedStyle(document.documentElement);
    const cRoute = css.getPropertyValue('--status-progress').trim() || '#3E7CB1';
    const cOnMarker = css.getPropertyValue('--on-marker').trim() || '#1c2433';

    leaflet.polyline(coords, { color: cRoute, weight: 3, opacity: 0.85, dashArray: '6 4' }).addTo(rLayer);
    routeResult.orderedTasks.forEach((task, idx) => {
      if (task.lat == null || task.lng == null) return;
      const icon = leaflet.divIcon({
        className: '',
        html: `<div style="background:${cRoute};color:${cOnMarker};border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${idx + 1}</div>`,
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

    // Auto-discovery: registra i codici trovati nel file
    const discoveredCodes = [...new Set(
      parsed
        .map(t => (t.codice ?? t.attivita ?? '').trim())
        .filter(c => c.length > 0)
    )];
    if (discoveredCodes.length > 0) {
      fetch('/api/admin/allegato10-codici', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codici: discoveredCodes }),
      }).catch(() => {}); // fire-and-forget
    }

    setExcelMode(true);
    setSorgente('excel');
    setExcelOnlyManualAction(false);
    setRouteMode(false);
    setRouteResult(null);
    setGeocodingProgress(null);
    setDistribution(null);
    setUnassignedTasks([]);
    setSelectedExcelTaskId(null);
    setEditingTaskId(null);

    // ── Auto-assegnazione da colonna Esecutore ──
    esecutoreAutoDistributedRef.current = false;
    const { pins, operatoriDaSelezionare, nonAbbinati } = buildEsecutorePins(filtered, operatorOptions);
    setEsecutorePins(pins);
    setEsecutoreWarnings(nonAbbinati);
    if (operatoriDaSelezionare.length > 0) {
      const counts: Record<string, number> = {};
      for (const sid of Object.values(pins)) counts[sid] = (counts[sid] ?? 0) + 1;
      const autoOps: OpConfig[] = operatoriDaSelezionare.map((staffId) => {
        const operator = operatorOptions.find((o) => o.id === staffId)!;
        const isRepOnDay = operator.reperibileDates.includes(planningDate);
        const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;
        const base = usesHome
          ? { lat: operator.homeLat!, lng: operator.homeLng! }
          : operator.startLat != null && operator.startLng != null
            ? { lat: operator.startLat, lng: operator.startLng }
            : null;
        const startAddress = usesHome ? (operator.homeAddress ?? operator.startAddress) : operator.startAddress;
        return { id: staffId, name: operator.displayName, qty: counts[staffId] ?? 0, base, startAddress };
      });
      setSelectedOps(autoOps);
    } else {
      setSelectedOps([]);
    }
  }, [operatorOptions, planningDate]);

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
    setSorgente('excel');
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

  const caricaInterventiDelGiorno = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/interventi/da-pianificare?data=${planningDate}&committente=acea`,
      );
      const json = (await res.json().catch(() => ({}))) as { interventi?: Task[]; error?: string };
      if (!res.ok) {
        alert(`Caricamento interventi non riuscito — ${json.error ?? res.status}.`);
        return;
      }
      const interventi = json.interventi ?? [];
      if (interventi.length === 0) {
        alert(`Nessun intervento da pianificare per il ${planningDate}.`);
        return;
      }
      setExcelTasks(interventi);
      setExcelMode(true);
      setSorgente('interventi');
      setExcelOnlyManualAction(false);
      setRouteMode(false);
      setRouteResult(null);
      setGeocodingProgress(null);
      setDistribution(null);
      setUnassignedTasks([]);
      setSelectedExcelTaskId(null);
      setEditingTaskId(null);
      setEsecutorePins({});
      setEsecutoreWarnings([]);
      setSelectedOps([]);
      setShowOpPicker(false);
      setZtlConflicts([]);
    } catch {
      alert('Errore di rete nel caricamento degli interventi.');
    }
  }, [planningDate]);

  const handleTemplateFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setTemplateGeocoding({ done: 0, total: 0 });

      // Parsing unificato — stessa logica del caricamento Excel principale:
      // supporta ATTGIORN, Massiva/Rapportini e Export Dati/Geocall.
      // Legge anche la colonna esecutore/operatore se presente.
      const parsed = await parseExcelToTasks(file);
      if (parsed.length === 0) {
        setTemplateGeocoding(null);
        return;
      }

      // Assegna ID univoci con prefisso stabile: evita collisioni con i task
      // row-{i} dell'import principale qualora si carichino entrambi.
      const prefix = `tpl-${Date.now()}`;
      const tasks: Task[] = parsed.map((t, idx) => ({ ...t, id: `${prefix}-${idx}` }));

      setTemplateGeocoding({ done: 0, total: tasks.length });
      const geocoded: Task[] = [];

      // Geocodifica con geocodeTask: usa la cache del progetto + correzioni manuali,
      // esattamente come fa il flusso principale (startGeocoding).
      for (let i = 0; i < tasks.length; i++) {
        geocoded.push(await geocodeTask(tasks[i]));
        setTemplateGeocoding({ done: i + 1, total: tasks.length });
      }

      // ── Gestione esecutori (colonna operatore nel file) ──────────────────────
      // Abbina i nomi alla lista operatori noti (stesso algoritmo del file principale).
      const { pins, nonAbbinati } = buildEsecutorePins(geocoded, operatorOptions);
      if (nonAbbinati.length > 0) setEsecutoreWarnings((prev) => [...prev, ...nonAbbinati]);

      // Separa i task in due bucket:
      //   • esecutore trovato E operatore nel gruppo → aggancia direttamente
      //   • tutto il resto (esecutore assente / non nel gruppo) → Non assegnate
      const perOperatore: Record<string, Task[]> = {};
      const nuoviNonAssegnati: Task[] = [];

      for (const task of geocoded) {
        const staffId = pins[task.id];
        const inGruppo = staffId && distribution
          ? distribution.some((d) => d.staffId === staffId)
          : false;

        if (inGruppo && staffId) {
          if (!perOperatore[staffId]) perOperatore[staffId] = [];
          perOperatore[staffId].push(task);
        } else {
          nuoviNonAssegnati.push(task);
        }
      }

      // Aggancia i task agli operatori rispettivi (nessuna ridistribuzione cieca),
      // stesso comportamento di addManualTask con operatore presente nel gruppo.
      if (Object.keys(perOperatore).length > 0) {
        setDistribution((prev) => {
          if (!prev) return prev;
          let next = prev;
          for (const [staffId, tasksPerOp] of Object.entries(perOperatore)) {
            const idx = next.findIndex((d) => d.staffId === staffId);
            if (idx < 0) continue;
            for (const task of tasksPerOp) {
              next = appendTaskToOperator(next, idx, task, optimizeRouteByFascia);
            }
          }
          return next;
        });
        // Allinea il contatore "N. INTERVENTI" di selectedOps
        setSelectedOps((prev) =>
          prev.map((o) => {
            const count = perOperatore[o.id]?.length ?? 0;
            return count > 0 ? { ...o, qty: o.qty + count } : o;
          }),
        );
        if (Object.keys(pins).length > 0) setEsecutorePins((prev) => ({ ...prev, ...pins }));
      }

      // Tutti i task entrano nel pool (per un'eventuale "Distribuisci" successivo).
      setTemplateTasks((prev) => [...prev, ...geocoded]);
      // Solo quelli non abbinati vanno in "Non assegnate" (marker giallo sulla mappa).
      if (nuoviNonAssegnati.length > 0) setUnassignedTasks((prev) => [...prev, ...nuoviNonAssegnati]);
      setTemplateGeocoding(null);
    } catch (error) {
      console.error('Error processing template file:', error);
      setTemplateGeocoding(null);
    }

    if (fileTemplateInputRef.current) {
      fileTemplateInputRef.current.value = '';
    }
  }, [distribution, operatorOptions]);

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

  // Risultati della barra di ricerca interventi (tra tutti gli operatori)
  const risultatiRicerca = useMemo(
    () => (distribution ? cercaInterventi(distribution, searchQuery) : []),
    [distribution, searchQuery],
  );

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
    // Reperibile solo se lo è nel giorno esatto di pianificazione selezionato
    const isRepOnDay = operator.reperibileDates.includes(planningDate);
    const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;

    const base = usesHome
      ? { lat: operator.homeLat!, lng: operator.homeLng! }
      : operator.startLat != null && operator.startLng != null
        ? { lat: operator.startLat, lng: operator.startLng }
        : null;
    const startAddress = usesHome
      ? (operator.homeAddress ?? operator.startAddress)
      : operator.startAddress;

    const ass = assenzeByStaff[operator.id];
    const blocca = !!(ass && isAssenzaIntera(ass));

    setSelectedOps((prev) => {
      const already = prev.some((o) => o.id === operator.id);
      if (already) return prev.filter((o) => o.id !== operator.id); // deseleziona sempre permesso
      if (blocca) return prev;                                       // assenza intera: non aggiungere
      return [...prev, { id: operator.id, name: operator.displayName, qty: 0, base, startAddress }];
    });

    if (blocca) {
      setAssenzaMsg(`${operator.displayName} è assente (${ass!.tipo}) il ${planningDate}: non assegnabile.`);
    }
  }, [planningDate, assenzeByStaff]);

  // Aggiorna la quantità di un operatore
  const changeOpQty = useCallback((id: string, qty: number) => {
    setSelectedOps((prev) => prev.map((o) => o.id === id ? { ...o, qty } : o));
  }, []);

  // True se l'operatore ha un'assenza a giornata intera nel giorno pianificato.
  const isAssenteIntera = (staffId: string) => {
    const a = assenzeByStaff[staffId];
    return !!(a && isAssenzaIntera(a));
  };

  // Operatori già nel piano che ora risultano assenti-interi (conflitto retroattivo).
  const conflittiAssenza = useMemo(
    () => selectedOps.filter((o) => isAssenteIntera(o.id)),
    [selectedOps, assenzeByStaff] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Badge assenza per la lista di selezione operatori.
  const renderAssenzaBadge = (staffId: string) => {
    const a = assenzeByStaff[staffId];
    if (!a) return null;
    const intera = isAssenzaIntera(a);
    return (
      <span
        className="ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
        style={
          intera
            ? { backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }
            : { backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }
        }
        title={intera ? 'Assente tutto il giorno' : 'Disponibilità parziale'}
      >
        {intera ? '🔒 ' : ''}{a.tipo}{intera ? '' : ` · ${labelOrario(a.ora_da, a.ora_a)}`}
      </span>
    );
  };

  // Applica la propagazione ai rapportini (riusa i token esistenti; preserva le risposte lato server).
  const applicaRapportini = useCallback(async (pid: string, confermaInviati: boolean) => {
    if (!rapTemplateId) { setRapError('Nessun modello rapportino attivo: rapportini non aggiornati.'); return; }
    try {
      const rg = await fetch('/api/mappa/rapportini/genera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pianoId: pid, templateId: rapTemplateId, confermaInviati }),
      });
      if (rg.ok) {
        const r2 = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
        const d2 = await r2.json();
        setRapStato(Array.isArray(d2) ? d2 : []);
      } else if (rg.status === 409) {
        const dataConf = (await rg.json().catch(() => ({}))) as { conflicts?: typeof rapConflicts; error?: string };
        if (Array.isArray(dataConf.conflicts) && dataConf.conflicts.length > 0) setRapConflicts(dataConf.conflicts);
        else setRapError(dataConf.error ?? 'Aggiornamento rapportini: conflitto non risolvibile.');
      } else {
        const ej = (await rg.json().catch(() => ({}))) as { error?: string };
        setRapError(ej.error ?? 'Aggiornamento rapportini non riuscito.');
      }
    } catch {
      setRapError("Errore di rete nell'aggiornamento dei rapportini.");
    }
  }, [rapTemplateId]);

  // Salva distribuzione su Supabase
  const saveDistribution = useCallback(async () => {
    if (!distribution || !selectedOps.length) return;

    if (sorgente === 'interventi') {
      setSavingDistribution(true);
      setSavedDistribution(false);
      try {
        const assegnazioni = buildDistribuzionePayload(distribution);
        const res = await fetch('/api/interventi/distribuzione', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: planningDate, assegnazioni }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          assegnati?: number;
          scartati?: Array<{ id: string; errore: string }>;
          error?: string;
        };
        if (!res.ok) {
          alert(`Distribuzione non riuscita — ${json.error ?? res.status}.`);
        } else {
          setSavedDistribution(true);
          const nScartati = json.scartati?.length ?? 0;
          alert(`${json.assegnati ?? 0} interventi assegnati${nScartati ? `, ${nScartati} scartati` : ''}.`);
        }
      } finally {
        setSavingDistribution(false);
      }
      return;
    }

    // Avviso: i task non assegnati non finiscono in alcun operatore del piano.
    if (unassignedTasks.length > 0) {
      const ok = window.confirm(
        `Ci sono ${unassignedTasks.length} interventi non assegnati: resteranno fuori dal piano finché non li assegni a un operatore. Salvare comunque?`,
      );
      if (!ok) return;
    }

    setSavingDistribution(true);
    setSavedDistribution(false);
    try {
      const operatori = selectedOps.map((op, idx) => {
        const dist = distribution[idx];
        return {
          staff_id: dist.staffId,
          staff_name: op.name,
          colore: dist.color,
          km: dist.km,
          task_count: dist.tasks.length,
          start_address: dist.startAddress || null,
          tasks: dist.tasks,
          polyline: dist.polyline,
        };
      });

      const payload = {
        data: planningDate,
        territorio: selectedPlanningTerritory?.name ?? null,
        note: '',
        stato: 'confermato',
        operatori,
        regole: manualRules,
        lucchetti: operatorLocks,
        manualiLiberi: operatorFreeLane,
        eliminati: eliminatiAnnullati,
      };

      // Update in-place se il piano esiste già: mantiene piano_id → i link rapportini restano validi
      const res = currentPianoId
        ? await fetch('/api/mappa/piani', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentPianoId, ...payload }),
          })
        : await fetch('/api/mappa/piani', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        const json = await res.json();
        setSavedDistribution(true);
        if (json.eliminatiOk === false) {
          alert('Attenzione: alcuni interventi eliminati non sono stati rimossi del tutto dal database. Riprova il salvataggio.');
        } else {
          setEliminatiAnnullati([]);
        }
        const pid = json.id ?? currentPianoId;
        if (json.id) {
          setCurrentPianoId(json.id);
          window.history.replaceState({}, '', `/hub/mappa?vista=pianifica&pianoId=${json.id}`);
        }
        // Unificazione: genera/aggiorna i record `interventi` del piano (alimenta torre/agenda)
        if (pid) {
          try {
            const ri = await fetch('/api/mappa/piani/interventi', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pianoId: pid }),
            });
            const rj = (await ri.json().catch(() => ({}))) as { creati?: number; preservati?: number; error?: string };
            if (!ri.ok) {
              alert(`Torre: creazione interventi NON riuscita — ${rj.error ?? ri.status}.\nHai applicato la migration 20260603030000?`);
            } else {
              alert(`Torre: ${rj.creati ?? 0} interventi generati per la torre di controllo (${rj.preservati ?? 0} già chiusi preservati).`);
            }
          } catch {
            alert('Torre: errore di rete nella creazione interventi.');
          }

          // Auto, sempre: genera/aggiorna i rapportini riusando i token esistenti
          // (stesso link digitale + Excel; risposte già date preservate dal merge lato server).
          // Best-effort: non blocca il salvataggio del piano.
          if (rapTemplateId) {
            try {
              const ap = await fetch('/api/mappa/piani/anteprima-rapportini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pianoId: pid, operatori }),
              });
              if (ap.ok) {
                const diff = (await ap.json()) as import('@/utils/rapportini/diffRapportini').DiffRapportini;
                if (diff.bloccati.length > 0) {
                  const elenco = diff.bloccati.map((b) => `• ${b.descr} (${b.daNome} → ${b.aNome})`).join('\n');
                  alert(`Questi interventi sono già completati e non possono essere spostati.\nRiportali all'operatore originale e risalva:\n\n${elenco}`);
                } else if (diff.nessunaModifica) {
                  await applicaRapportini(pid, false);
                } else {
                  // Riepilogo + conferma con dialogo NATIVO (sempre visibile): la modale React poteva
                  // non comparire, lasciando i rapportini non aggiornati. Affidabile e bloccante.
                  const { testo, haInviati } = buildRiepilogoConferma(diff);
                  if (window.confirm(testo)) await applicaRapportini(pid, haInviati);
                }
              } else {
                const ej = (await ap.json().catch(() => ({}))) as { error?: string };
                setRapError(ej.error ?? 'Anteprima rapportini non riuscita.');
              }
            } catch {
              setRapError("Errore di rete nell'anteprima dei rapportini.");
            }
          } else {
            setRapError('Nessun modello rapportino attivo: rapportini non aggiornati.');
          }
        }
      } else {
        // Il PUT/POST del piano è fallito: NON restare in silenzio (altrimenti il task
        // sembra salvato nella UI ma sparisce al ricaricamento).
        const ej = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Salvataggio piano non riuscito — ${ej.error ?? res.status}.`);
      }
    } finally {
      setSavingDistribution(false);
    }
  }, [currentPianoId, distribution, planningDate, selectedOps, selectedPlanningTerritory, manualRules, operatorLocks, operatorFreeLane, sorgente, unassignedTasks, rapTemplateId, applicaRapportini, eliminatiAnnullati]);

  // Resetta savedDistribution quando distribution cambia
  useEffect(() => {
    setSavedDistribution(false);
  }, [distribution]);

  // ── Rapportini inline ──────────────────────────────────────────────────────
  const caricaRapportini = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/mappa/rapportini?pianoId=${pid}`);
      const data = await res.json();
      const list: RapportinoStato[] = Array.isArray(data) ? data : [];
      setRapStato(list);
      // Preserva il modello già usato dai rapportini esistenti: così la rigenerazione
      // non cambia il template e non crea link nuovi.
      const tpl = list.find((r) => r.template_id)?.template_id;
      if (tpl) setRapTemplateId(tpl);
    } catch {
      setRapStato([]);
    }
  }, []);

  // Template di default (una volta)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/rapportino-template');
        const list = await res.json();
        const arr: Array<{ id: string; nome: string; is_default?: boolean; solo_manuale?: boolean; tipo?: string; active?: boolean; campi?: TemplateCampo[]; info_campi?: TemplateInfoCampo[] }> = Array.isArray(list) ? list : [];
        const arrFiltrato = arr.filter((t) => !t.solo_manuale);
        setRapTemplates(arrFiltrato);
        // Nessuna preselezione automatica: la scelta del modello è obbligatoria e deve
        // precedere il salvataggio/generazione. I piani riaperti recuperano comunque il
        // template già usato tramite caricaRapportini(); per i nuovi piani con RESINE la
        // preselezione risanamento resta attiva (effetto dedicato più sotto).
      } catch {
        /* nessun template attivo */
      }
    })();
  }, []);

  // Risanamento: se il piano ha task con attività RESINE, preseleziona il template risanamento.
  useEffect(() => {
    if (rapTemplates.length === 0 || !distribution) return;
    const tasks = distribution.flatMap((d) => d.tasks ?? []);
    if (!pianoHaRisanamento(tasks)) return;
    const tplId = risolviTemplateRisanamento(rapTemplates);
    if (tplId) setRapTemplateId(tplId);
  }, [distribution, rapTemplates]);

  // Carica lo stato rapportini quando il piano è salvato (incluso edit mode)
  useEffect(() => {
    if (savedDistribution && currentPianoId) caricaRapportini(currentPianoId);
    else {
      setRapStato([]);
      setRapError(null);
    }
  }, [savedDistribution, currentPianoId, caricaRapportini]);

  const eseguiGenerazione = useCallback(async (overwrite?: 'replace' | 'skip', overwriteSubmitted?: boolean) => {
    if (!currentPianoId || !rapTemplateId) return;
    setRapGenerating(true);
    setRapError(null);
    try {
      const res = await fetch('/api/mappa/rapportini/genera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pianoId: currentPianoId, templateId: rapTemplateId, overwrite, overwriteSubmitted }),
      });
      const data = await res.json();
      if (res.status === 409 && Array.isArray(data?.conflicts)) {
        setRapConflicts(data.conflicts);
        return;
      }
      if (!res.ok || data?.error) {
        setRapError(data?.error ?? 'Errore durante la generazione.');
        return;
      }
      setRapConflicts(null);
      setOverwriteInviati(false);
      await caricaRapportini(currentPianoId);
    } catch {
      setRapError('Errore durante la generazione.');
    } finally {
      setRapGenerating(false);
    }
  }, [currentPianoId, rapTemplateId, caricaRapportini]);

  const generaRapportini = useCallback(() => {
    if (!rapTemplateId) {
      setRapError('Nessun modello attivo. Crea un template in Impostazioni → Template rapportini.');
      return;
    }
    void eseguiGenerazione();
  }, [eseguiGenerazione, rapTemplateId]);

  const rapByStaff = useMemo(() => {
    const m = new Map<string, RapportinoStato>();
    rapStato.forEach((r) => m.set(r.staff_id, r));
    return m;
  }, [rapStato]);

  const rapDataLabel = useMemo(
    () => new Date(planningDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [planningDate],
  );

  const handleCopyLink = useCallback(async (r: RapportinoStato) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch {
      /* clipboard non disponibile */
    }
  }, []);

  // Distribuisce i task geocodificati tra gli operatori rispettando le quantità
  const distributeToOps = useCallback(() => {
    if (!selectedOps.length) return;

    const seenPdr = new Set<string>();
    const geocoded = allTasks
      .filter((t) => t.lat != null && t.lng != null)
      .filter((t) => {
        if (!t.pdr) return true;
        if (seenPdr.has(t.pdr)) return false;
        seenPdr.add(t.pdr);
        return true;
      });

    if (!geocoded.length) return;

    // ── Fase 0: assegnazioni manuali (regole CAP/attività/ODS+indirizzo) ──
    const opsForAssign = selectedOps.map((op) => ({ id: op.id, qty: op.qty }));
    const manual = applyManualAssignments(geocoded, manualRules, opsForAssign, operatorLocks);
    if (manual.warnings.length) {
      setZtlConflicts((prev) => [...prev, ...manual.warnings.map((w) => w.message)]);
    }
    const closedSet = new Set(manual.closedStaffIds);
    const idxByStaff = new Map<string, number>();
    selectedOps.forEach((op, i) => idxByStaff.set(op.id, i));
    const manualPre: Map<number, Task[]> = new Map(selectedOps.map((_, i) => [i, []]));
    for (const [staffId, tks] of Object.entries(manual.assignedByStaff)) {
      const i = idxByStaff.get(staffId);
      if (i != null) manualPre.set(i, tks);
    }
    const manualAssignedIds = new Set<string>(
      Object.values(manual.assignedByStaff).flat().map((t) => t.id)
    );
    // ── Pin esecutore: forza i task al loro operatore (come le assegnazioni manuali) ──
    if (Object.keys(esecutorePins).length > 0) {
      for (const t of geocoded) {
        const staffId = esecutorePins[t.id];
        if (!staffId) continue;
        if (manualAssignedIds.has(t.id)) continue; // già preso da una regola manuale
        const i = idxByStaff.get(staffId);
        if (i == null) continue; // operatore non selezionato → lascia al flusso normale
        manualPre.get(i)!.push(t);
        manualAssignedIds.add(t.id);
      }
    }
    const afterManual = geocoded.filter((t) => !manualAssignedIds.has(t.id));

    // ── Fase 1: pre-assegna i task ZTL agli operatori autorizzati più vicini (esclusi i 🔒 chiusi) ──
    const preAssigned: Map<number, Task[]> = new Map(
      selectedOps.map((_, i) => [i, []])
    );
    const ztlAssignedIds = new Set<string>();

    for (const task of afterManual) {
      const ztl = getTaskZtl(task.cap, ztlZones);
      if (!ztl) continue;

      const authorizedIdxs = selectedOps
        .map((op, i) => ({ i, op }))
        .filter(({ op }) => ztl.authorized_staff_ids.includes(op.id) && !closedSet.has(op.id));

      if (!authorizedIdxs.length) continue;

      const nearest = authorizedIdxs.reduce((best, curr) => {
        const currBase = selectedOps[curr.i].base;
        const bestBase = selectedOps[best.i].base;
        if (!currBase) return best;
        if (!bestBase) return curr;
        const dCurr = distanceMeters({ lat: task.lat!, lng: task.lng! }, currBase);
        const dBest = distanceMeters({ lat: task.lat!, lng: task.lng! }, bestBase);
        return dCurr < dBest ? curr : best;
      });

      preAssigned.get(nearest.i)!.push(task);
      ztlAssignedIds.add(task.id);
    }

    // ── Fase 2: distribuzione automatica (task non-manuali e non-ZTL; operatori non chiusi) ──
    const nonZtlTasks = afterManual.filter((t) => !ztlAssignedIds.has(t.id));
    const adjustedOps: OpConfig[] = selectedOps
      .filter((op) => !closedSet.has(op.id))
      .map((op) => {
        const i = idxByStaff.get(op.id)!;
        const pinned = (manualPre.get(i)?.length ?? 0) + (preAssigned.get(i)?.length ?? 0);
        return { ...op, qty: Math.max(0, op.qty - pinned) };
      });

    const { groups, unassigned } = capacityDistributeWithUnassigned(nonZtlTasks, adjustedOps);
    const autoByIdx: Map<number, Task[]> = new Map(selectedOps.map((_, i) => [i, []]));
    adjustedOps.forEach((op, k) => {
      const i = idxByStaff.get(op.id);
      if (i != null) autoByIdx.set(i, groups[k] ?? []);
    });

    // ── Fase 3: unisci manuali + ZTL + automatici ──
    const result: DistEntry[] = selectedOps.map((op, i) => {
      const grp = [
        ...(manualPre.get(i) ?? []),
        ...(preAssigned.get(i) ?? []),
        ...(autoByIdx.get(i) ?? []),
      ];
      const routeRes =
        grp.length >= 1
          ? optimizeRouteByFascia(grp, op.base ?? undefined)
          : { orderedTasks: grp, totalDistanceKm: 0, polyline: [], schedule: [] };
      return {
        op: op.name ?? op.id ?? 'Operatore',
        staffId: op.id,
        color: OP_COLORS[i % OP_COLORS.length],
        tasks: routeRes.orderedTasks,
        km: routeRes.totalDistanceKm,
        polyline: routeRes.polyline,
        base: op.base,
        startAddress: op.startAddress,
        schedule: routeRes.schedule,
      };
    });

    setDistribution(result);
    setUnassignedTasks(unassigned);
    setActiveOpIdx(0);
    setRouteMode(false);
    setRouteResult(null);
    setShowOpPicker(false);
    setMovingTaskId(null);

    // Fire-and-forget save to Supabase
    fetch('/api/mappa/distribuzioni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: planningDate,
        distribuzioni: result.map(d => ({ staff_id: d.staffId, task_count: d.tasks.length }))
      })
    }).catch(() => {});

    // ── Controlla conflitti residui (task ZTL senza operatori autorizzati) ──
    const conflicts: string[] = [];
    result.forEach(({ op, staffId, tasks }) => {
      tasks.forEach((t) => {
        const ztl = getTaskZtl(t.cap, ztlZones);
        if (!ztl) return;
        if (!ztl.authorized_staff_ids.includes(staffId)) {
          conflicts.push(`"${op ?? 'Operatore'}" non ha il permesso ZTL per ${ztl.name} (${t.indirizzo})`);
        }
      });
    });
    setZtlConflicts([...manual.warnings.map((w) => w.message), ...conflicts]);
  }, [selectedOps, allTasks, ztlZones, manualRules, operatorLocks, esecutorePins]);

  const addManualTask = useCallback(async (data: ManualTaskData) => {
    const operator = data.staffId ? operatorOptions.find((o) => o.id === data.staffId) : undefined;
    const task: Task & { _operatore?: string } = {
      id: `manual-${Date.now()}`,
      indirizzo: data.indirizzo.trim(),
      cap: data.cap.trim(),
      citta: data.citta.trim(),
      odl: data.odl.trim(),
      priorita: 0,
      pdr: data.pdr.trim() || undefined,
      matricola: data.matricola.trim() || undefined,
      attivita: data.attivita.trim() || undefined,
      fascia_oraria: data.fascia_oraria.trim(),
      nominativo: data.nominativo.trim() || undefined,
      note: data.note.trim() || undefined,
      _operatore: operator?.displayName,
    };
    const geocoded = await geocodeTask(task);
    setExcelTasks((prev) => [...prev, geocoded]);
    setExcelMode(true);

    // Nessun esecutore → l'intervento resta NON assegnato: compare in "Non assegnate"
    // e sulla mappa (marker giallo), assegnabile a mano con assignUnassignedTask.
    if (!operator) {
      setUnassignedTasks((prev) => [...prev, geocoded]);
      return;
    }

    setEsecutorePins((prev) => ({ ...prev, [task.id]: operator.id }));

    // Operatore già nel gruppo (piano riaperto) → aggancia SOLO a lui, preservando
    // le assegnazioni degli altri (niente ridistribuzione cieca).
    const idx = distribution ? distribution.findIndex((d) => d.staffId === operator.id) : -1;
    if (distribution && idx >= 0) {
      setDistribution((prev) => (prev ? appendTaskToOperator(prev, idx, geocoded, optimizeRouteByFascia) : prev));
      // Allinea subito il conteggio "N. INTERVENTI" (qty) al nuovo numero di task dell'operatore.
      setSelectedOps((prev) => prev.map((o) => (o.id === operator.id ? { ...o, qty: (o.qty || 0) + 1 } : o)));
      return;
    }

    // Operatore non ancora nel gruppo: calcola base/partenza una volta sola.
    const isRepOnDay = operator.reperibileDates.includes(planningDate);
    const usesHome = isRepOnDay && operator.homeLat != null && operator.homeLng != null;
    const base = usesHome
      ? { lat: operator.homeLat!, lng: operator.homeLng! }
      : operator.startLat != null && operator.startLng != null
        ? { lat: operator.startLat, lng: operator.startLng }
        : null;
    const startAddress = usesHome ? (operator.homeAddress ?? operator.startAddress) : operator.startAddress;

    // selectedOps "next": l'operatore scelto entra in coda se assente (qty allineata).
    const opsNext: OpConfig[] = selectedOps.some((o) => o.id === operator.id)
      ? selectedOps.map((o) => (o.id === operator.id ? { ...o, qty: (o.qty || 0) + 1 } : o))
      : [...selectedOps, { id: operator.id, name: operator.displayName, qty: distribution ? 1 : 0, base, startAddress }];
    setSelectedOps(opsNext);

    // Piano già distribuito (riaperto o in modifica): il Salva deve SOLO salvare. Niente
    // ridistribuzione cieca: ricostruisco la distribuzione ALLINEATA a opsNext, preservando i
    // task di ogni operatore e agganciando il nuovo intervento SOLO all'operatore scelto. La
    // distribuzione automatica resta esclusiva del pulsante "Distribuisci". Senza distribuzione
    // (piano in costruzione) il task resta in coda finché l'utente non distribuisce.
    if (distribution) {
      const orderedStaffIds = opsNext.map((o) => o.id);
      const metaById = new Map(opsNext.map((o) => [o.id, o] as const));
      setDistribution((prev) =>
        prev
          ? alignAndAppendTask(
              orderedStaffIds,
              prev,
              operator.id,
              geocoded,
              optimizeRouteByFascia,
              (staffId, i): DistEntry => {
                const m = metaById.get(staffId);
                return {
                  op: m?.name ?? staffId,
                  staffId,
                  color: OP_COLORS[i % OP_COLORS.length],
                  tasks: [],
                  km: 0,
                  polyline: [],
                  base: m?.base ?? null,
                  startAddress: m?.startAddress ?? null,
                  schedule: [],
                };
              },
            )
          : prev,
      );
    }
  }, [operatorOptions, planningDate, distribution, selectedOps]);

  // Nessuna auto-distribuzione: gli esecutori indicati nel file restano come
  // PROPOSTA (pin + operatori auto-selezionati), ma la distribuzione parte solo
  // quando l'utente conferma con "Distribuisci". Così può aggiungere altri
  // operatori e impostare le quantità per le righe SENZA esecutore prima di
  // distribuire. Le righe con esecutore restano comunque vincolate al loro operatore.

  // Sposta un task da un operatore a un altro e ricalcola le route
  // Costruisce un gruppo distribuzione VUOTO per un operatore selezionato (colore dalla palette).
  const makeEmptyEntry = useCallback((op: OpConfig, color: string): DistEntry => ({
    op: op.name ?? op.id ?? 'Operatore',
    staffId: op.id,
    color,
    tasks: [],
    km: 0,
    polyline: [],
    base: op.base,
    startAddress: op.startAddress,
    schedule: [],
  }), []);

  // Sposta un singolo task all'operatore `op` (anche se NON ancora distribuito: gli crea un gruppo
  // vuoto al primo spostamento). `opSelIdx` = indice in selectedOps, per il colore della palette.
  const moveTask = useCallback((taskId: string, fromIdx: number, op: OpConfig, opSelIdx: number) => {
    const color = OP_COLORS[opSelIdx % OP_COLORS.length];
    setDistribution((prev) => {
      if (!prev) return prev;
      const { distribution: withGroup, idx } = ensureOperatorInDistribution(prev, op.id, () => makeEmptyEntry(op, color));
      return moveTaskToOperator(withGroup, taskId, fromIdx, idx, optimizeRouteByFascia);
    });
    setMovingTaskId(null);
  }, [makeEmptyEntry]);

  // Sposta TUTTI gli interventi non-completati dell'operatore `fromIdx` all'operatore `op` (anche non distribuito).
  const moveAllTasks = useCallback((fromIdx: number, op: OpConfig, opSelIdx: number) => {
    const color = OP_COLORS[opSelIdx % OP_COLORS.length];
    setDistribution((prev) => {
      if (!prev) return prev;
      const { distribution: withGroup, idx } = ensureOperatorInDistribution(prev, op.id, () => makeEmptyEntry(op, color));
      return moveAllTasksToOperator(withGroup, fromIdx, idx, optimizeRouteByFascia);
    });
    setMovingAllOpen(false);
  }, [makeEmptyEntry]);

  // Annulla/Ripristina un task: marca `annullato` (si applica al Salva, come Sposta)
  const toggleAnnullaTask = useCallback((taskId: string, opIdx: number) => {
    if (!distribution) return;
    const newDist = distribution.map((d) => ({ ...d, tasks: [...d.tasks] }));
    const grp = newDist[opIdx].tasks;
    const idx = grp.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    grp[idx] = { ...grp[idx], annullato: !grp[idx].annullato };
    setDistribution(newDist);
  }, [distribution]);

  // Elimina definitiva: rimuove il task dal piano (al Salva sparisce voce + intervento).
  // Per i task GIÀ annullati registra l'identità, così il Salva cancella anche l'intervento canonico.
  const eliminaTask = useCallback((taskId: string, opIdx: number) => {
    if (!distribution) return;
    const t = distribution[opIdx]?.tasks.find((x) => x.id === taskId);
    if (!t) return;
    if (t.stato === 'completato') return;
    if (!window.confirm("Eliminare definitivamente questo intervento?\nSparirà dal rapportino dell'operatore e non sarà recuperabile.\nL'effetto si applica al Salva.")) return;
    if (t.annullato) {
      const chiave = identitaIntervento({
        odl: t.odl || null,
        matricola_contatore: t.matricola ?? null,
        indirizzo: t.indirizzo ?? null,
        intervento_tipo: t.attivita ?? null,
      });
      if (chiave) setEliminatiAnnullati((prev) => (prev.includes(chiave) ? prev : [...prev, chiave]));
    }
    setDistribution(removeTaskFromOperator(distribution, opIdx, taskId, optimizeRouteByFascia));
  }, [distribution]);

  const assignUnassignedTask = useCallback((taskId: string, toIdx: number) => {
    if (!distribution) return;
    const task = unassignedTasks.find((entry) => entry.id === taskId);
    if (!task) return;

    const newDist = distribution.map((d) => ({ ...d, tasks: [...d.tasks] }));
    newDist[toIdx].tasks.push(task);

    const grp = newDist[toIdx].tasks;
    if (grp.length >= 1) {
      const res = optimizeRouteByFascia(grp, newDist[toIdx].base ?? undefined);
      newDist[toIdx] = { ...newDist[toIdx], tasks: res.orderedTasks, km: res.totalDistanceKm, polyline: res.polyline, schedule: res.schedule };
    } else {
      newDist[toIdx] = { ...newDist[toIdx], km: 0, polyline: [], schedule: [] };
    }

    setDistribution(newDist);
    setUnassignedTasks((prev) => prev.filter((entry) => entry.id !== taskId));
    setActiveOpIdx(toIdx);
    setMovingTaskId(null);
  }, [distribution, unassignedTasks]);



  const exportDistribution = useCallback(async () => {
    if (!distribution) return;

    try {
      // 1. Carica il template rapportino
      const tplRes = await fetch('/templates/Rapportino.xlsx');
      if (!tplRes.ok) throw new Error('Template Rapportino.xlsx non trovato in /public/templates/');
      const tplBuf = await tplRes.arrayBuffer();

      const tplWb = new ExcelJS.Workbook();
      await tplWb.xlsx.load(tplBuf);

      const base = tplWb.worksheets[0];
      if (!base) throw new Error('Foglio template non valido.');
      base.name = '__TEMPLATE__';

      const dateStr = isoToDisplay(planningDate);

      // 2. Un foglio per operatore (clonato dal template)
      const tplSel = rapTemplates.find((t) => t.id === rapTemplateId);
      const infoCols = resolveInfoCampi(tplSel?.info_campi ?? null);
      const campiCols = [...(tplSel?.campi ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));

      for (const { op, tasks, staffId } of distribution) {
        const opName = op ?? staffId ?? 'Operatore';
        const sheetName = sanitizeSheetName(opName).slice(0, 31);
        const ws = cloneFromTemplate(base, sheetName, tplWb);
        const stiliBanda = preparaBanda(ws);

        // Intestazioni header template (B2 = data, B4 = operatore)
        ws.getCell('B2').value = dateStr;
        ws.getCell('B4').value = opName;

        // Riga 6 — intestazioni colonne (dinamiche da template)
        const hrow = ws.getRow(6);
        const headerLabels = [...infoCols.map((c) => c.etichetta), 'ORDINE', ...campiCols.map((c) => c.etichetta)];
        headerLabels.forEach((t, i) => { hrow.getCell(i + 1).value = t; });
        for (let c = headerLabels.length + 1; c <= 26; c++) hrow.getCell(c).value = null;
        hrow.commit();

        // 3. Righe dati — ordinate per fascia oraria
        // Esclude S-AI-051 e deduplica per PDR (stesso PDR = stessa visita)
        const seenPdrSheet = new Set<string>();
        const filtered = tasks.filter((t) => {
          const codice = (t.codice ?? '').toString().trim();
          if (/S-AI-051/i.test(codice)) return false;
          if (t.pdr) {
            if (seenPdrSheet.has(t.pdr)) return false;
            seenPdrSheet.add(t.pdr);
          }
          return true;
        });

        // L'ordine è già quello della route (ottimizzato per fascia + geografia)
        const sorted = filtered;

        sorted.forEach((t, idx) => {
          const rr = ws.getRow(7 + idx);
          const vi = taskToVoce(t, idx + 1) as VoceInfo;
          let col = 1;
          for (const c of infoCols) {
            if (c.chiave === 'fascia_oraria') {
              rr.getCell(col).value = extractReportTime(t.fascia_oraria || '');
              rr.getCell(col).numFmt = '@';
            } else if (c.chiave === 'coordinate') {
              const coord = (t.coordinate ?? '').trim();
              rr.getCell(col).value = coord
                ? ({ text: coord, hyperlink: mapsUrlFromCoordinate(coord) } as ExcelJS.CellHyperlinkValue)
                : '';
            } else {
              rr.getCell(col).value = valoreInfo(vi, c.chiave);
            }
            col++;
          }
          rr.getCell(col).value = idx + 1; col++;
          for (let k = 0; k < campiCols.length; k++) { rr.getCell(col).value = ''; col++; }
          rr.commit();
        });

        // Banda "INTERVENTI CON NOTE" dinamica: scende sotto l'ultimo intervento in overflow.
        posizionaBanda(ws, sorted.length, stiliBanda);

        // Auto-larghezza colonne dati (dinamica)
        const totalCols = infoCols.length + 1 + campiCols.length;
        for (let c = 1; c <= totalCols; c++) {
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
      // ── Scrivi xlsx nel buffer ──
      const xlsxBuf = await tplWb.xlsx.writeBuffer();

      // ── Crea ZIP con xlsx + Allegato 10 per ogni task ──
      const outputZip = new JSZip();
      const dateSlugZip = planningDate;
      const zipName = `RAPPORTINI_MAPPA_${dateSlugZip}.zip`;

      // Aggiungi il rapportino Excel
      const outName = `RAPPORTINI_MAPPA_${dateSlugZip}.xlsx`;
      outputZip.file(outName, xlsxBuf);

      // ── Allegato 10: genera un .docx per ogni task, combinati per operatore ──
      const allegato10Errors: string[] = [];

      const allTasks = distribution.flatMap(({ tasks }) => tasks);
      const needsLazio   = allTasks.some(t => detectTerritory(String(t.cap ?? '')) === 'lazio');
      const needsFirenze = allTasks.some(t => detectTerritory(String(t.cap ?? '')) === 'firenze');

      const [lazioTpl, firenzeTpl] = await Promise.all([
        needsLazio   ? getLazioTemplate()   : Promise.resolve(null),
        needsFirenze ? getFirenzeTemplate() : Promise.resolve(null),
      ]);

      for (const { op, tasks, staffId } of distribution) {
        const opName = op ?? staffId ?? 'Operatore';
        const filled: Record<'lazio' | 'firenze', string[]> = { lazio: [], firenze: [] };

        for (let idx = 0; idx < tasks.length; idx++) {
          const t = tasks[idx];
          try {
            const fields    = buildAllegato10FieldsFromTask(t, opName, dateStr);
            const codiceTask = (t.codice || t.attivita || '').trim();
            const shouldGenerate = allegato10ActiveCodes.length === 0 ||
              allegato10ActiveCodes.some(c => codiceTask.toUpperCase().startsWith(c.toUpperCase()));

            if (shouldGenerate) {
              const territory = detectTerritory(String(t.cap ?? '').trim());
              if (territory === 'lazio' && lazioTpl)
                filled.lazio.push(fillLazioXml(lazioTpl.xml, fields));
              else if (territory === 'firenze' && firenzeTpl)
                filled.firenze.push(fillFirenzeXml(firenzeTpl.xml, fields));
            }
          } catch (err) {
            allegato10Errors.push(`${opName} task ${idx + 1}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        const safeOp = opName.replace(/[^\w\s]/g,'').replace(/\s+/g,'_').slice(0,30);

        if (filled.lazio.length > 0 && lazioTpl) {
          try {
            outputZip.file(`allegato10/${safeOp}_Allegato10_LAZIO.docx`,
              await buildCombinedDocx(filled.lazio, lazioTpl));
          } catch (err) {
            allegato10Errors.push(`${opName} merge Lazio: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (filled.firenze.length > 0 && firenzeTpl) {
          try {
            outputZip.file(`allegato10/${safeOp}_Allegato10_FIRENZE.docx`,
              await buildCombinedDocx(filled.firenze, firenzeTpl));
          } catch (err) {
            allegato10Errors.push(`${opName} merge Firenze: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // ── Download ZIP ──
      const zipBlob = await outputZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();

      const errNote = allegato10Errors.length
        ? ` (⚠️ ${allegato10Errors.length} Allegato 10 non generati)`
        : '';
      alert(`ZIP generato: ${zipName}${errNote}`);
    } catch (err: any) {
      alert(err?.message || 'Errore durante la generazione del rapportino.');
    }
  }, [distribution, rapTemplates, rapTemplateId]);

  const handleNuovaPianificazione = useCallback(() => {
    geocodingActiveRef.current = false;
    setExcelTasks([]);
    setExcelMode(false);
    setExcelOnlyManualAction(false);
    setGeocodingProgress(null);
    setTemplateGeocoding(null);
    setTemplateTasks([]);
    setRouteMode(false);
    setRouteResult(null);
    setDistribution(null);
    setUnassignedTasks([]);
    setSelectedOps([]);
    setSelectedExcelTaskId(null);
    setEditingTaskId(null);
    setShowOpPicker(false);
    setZtlConflicts([]);
    setTerritoryFilter('');
    setPlanningDate('');
    setSetupModalDate('');
    setSetupDone(false);
  }, []);

  const downloadTemplate = useCallback(() => {
    const headers = [
      'CO', 'MATRICOLA', 'ODS/ODL', 'Indirizzo', 'CAP', 'COMUNE',
      'Tipo OdL(CdL)/Servizio', 'Esecutore', 'Fascia Appuntamento/Blocco',
      'PdR / Impianto', 'Nominativo', 'Tempo Esecuzione', 'Num Risorse', 'Lat', 'Long', 'Note per operatore',
    ];
    const examples = [
      ['FIRENZE', 'MAT00012345', '20043151148', 'VIA MOLINA 4', '50013', 'CAMPI BISENZIO', 'S-PR-007', 'ROSSI', '08:00-10:00', '00594202203925', 'Mario Rossi', '30', '1', '43.819489', '11.133204', 'Citofonare Rossi'],
      ['FIRENZE', 'MAT00067890', '20043043524', 'VIA DEI MALCONTENTI 1', '50122', 'FIRENZE', 'S-PR-053', 'BIANCHI', '08:00-10:00', '00594201242775', 'Lucia Bianchi', '30', '1', '43.768214', '11.262435', ''],
      ['ROMA', 'MAT00099999', '30012345678', 'VIA NAZIONALE 10', '00184', 'ROMA', 'S-MR-002', 'VERDI', '10:00-12:00', '00596100174001', 'Giuseppe Verdi', '15', '2', '41.901559', '12.492510', 'Accesso dal retro'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    ws['!cols'] = [8, 14, 16, 30, 8, 20, 20, 14, 22, 18, 24, 8, 8, 12, 12, 28].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export Dati');
    XLSX.writeFile(wb, 'template_mappa_operatori_con_nominativo.xlsx');
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative space-y-4">
      {!isEditMode && !setupDone && (() => {
        const isDateValid = setupModalDate && setupModalDate.trim() !== '';
        const isTerritoryValid = setupModalTerritory !== '';
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 rounded-2xl"
               style={{ minHeight: '300px' }}>
            <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-lg max-w-md w-full mx-4">
              <h2 className="text-lg font-semibold mb-6">Configura pianificazione</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-text-main)] mb-2">
                    Data pianificazione
                  </label>
                  <DatePicker
                    fullWidth
                    value={setupModalDate}
                    onChange={(iso) => setSetupModalDate(iso)}
                    ariaLabel="Data pianificazione"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-text-main)] mb-2">
                    Territorio
                  </label>
                  <select
                    value={setupModalTerritory}
                    onChange={(e) => setSetupModalTerritory(e.target.value)}
                    className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                  >
                    <option value="" disabled>— Seleziona territorio —</option>
                    {planningTerritories.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={!isDateValid || !isTerritoryValid}
                  onClick={() => {
                    setPlanningDate(setupModalDate);
                    setTerritoryFilter(setupModalTerritory);
                    setSetupDone(true);
                  }}
                  className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isDateValid && isTerritoryValid
                      ? 'bg-[var(--brand-primary)] text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)]'
                      : 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-subtle)] cursor-not-allowed'
                  }`}
                >
                  Conferma
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {(setupDone || isEditMode) && <PhaseStrip current={currentPhase} />}
      {/* Header + filtri */}
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-xl font-semibold">Pianifica indirizzi</div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                Data
              </label>
              <DatePicker
                value={planningDate}
                disabled={isEditMode || setupDone}
                onChange={(iso) => {
                  if (isEditMode || setupDone) return;
                  if (iso) {
                    setPlanningDate(iso);
                    setSelectedOps([]);
                    setDistribution(null);
                  }
                }}
                ariaLabel="Data pianificazione"
              />
              {isEditMode && (
                <span className="rounded-full border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                  Pianificazione in modifica
                </span>
              )}
              {setupDone && territoryFilter && (() => {
                const selectedTerritoryName = territories.find(
                  (t) => t.id === territoryFilter
                )?.name ?? '';
                return (
                  <span className="text-sm font-medium text-[var(--brand-text-main)]">
                    Territorio: {selectedTerritoryName}
                  </span>
                );
              })()}
              {(() => {
                const count = filteredAppointmentTasks.length;
                if (count === 0) return null;
                return (
                  <span className="rounded-full bg-[var(--brand-violet-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-violet)]">
                    {count} APT
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNuovaPianificazione}
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-sm font-medium text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]"
            >
              Nuova pianificazione
            </button>

            {!excelMode && (
              <button
                type="button"
                onClick={() => { setTerritoryFilter(''); setDayFilter(''); setOnlyRep(false); setRouteMode(false); }}
                className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-sm"
              >
                Azzera
              </button>
            )}

            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            <input ref={fileTemplateInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleTemplateFileChange} />

            <MenuDropdown
              align="right"
              buttonClassName="rounded-lg border border-[var(--brand-primary)]/40 bg-[var(--brand-primary-soft)] px-3 py-1.5 text-sm font-medium text-[var(--brand-primary)] hover:opacity-90"
              label="+ Aggiungi interventi ▾"
              items={[
                { label: 'Carica Excel',                    onClick: () => fileInputRef.current?.click(),          hidden: excelMode },
                { label: 'Carica interventi del giorno',    onClick: caricaInterventiDelGiorno,                    hidden: excelMode },
                { label: 'Scarica Template',                onClick: downloadTemplate,                             hidden: excelMode },
                { label: '+ Aggiungi attività da template', onClick: () => fileTemplateInputRef.current?.click(),  hidden: !(excelMode && distribution) },
                { label: '+ Aggiungi manuale',              onClick: () => setManualModalOpen(true),               hidden: !(excelMode && distribution) },
                { label: 'Chiudi Excel',                    onClick: clearExcel,                                   hidden: !excelMode },
              ] satisfies MenuItem[]}
            />

            {distribution && (
              <MenuDropdown
                align="right"
                buttonClassName="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
                label="Esporta ▾"
                items={[{ label: 'Esporta Excel', onClick: exportDistribution }]}
              />
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
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--on-primary)]'
                      : 'border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
                  } disabled:opacity-40`}
                >
                  Percorso ottimale
                </button>
              );
            })()}
          </div>
        </div>

        {/* Banner alert appuntamenti non assegnati */}
        {(() => {
          const now = new Date();
          const afterFifteen = now.getHours() >= 15;
          const isTomorrow = planningDate === isoTomorrow();
          const hasUnassignedAppointments = filteredAppointmentTasks.length > 0;
          const showAlert = afterFifteen && isTomorrow && hasUnassignedAppointments;

          if (!showAlert) return null;

          return (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning)]">
              <span>⚠️</span>
              <span>
                {filteredAppointmentTasks.length} appuntament
                {filteredAppointmentTasks.length === 1 ? 'o' : 'i'} per domani
                non ancora assegnat
                {filteredAppointmentTasks.length === 1 ? 'o' : 'i'} a nessun operatore.
              </span>
            </div>
          );
        })()}

        {/* Barra stato Excel + operatori */}
        {excelMode && (
          <div className="mt-3 space-y-2">
            {/* Riga geocodifica */}
            <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-semibold text-[var(--warning)]">{excelTasks.length}</span>
                  <span className="text-[var(--warning)]"> attività da Excel</span>
                  {excelGeocoded > 0 && (
                    <span className="ml-2 text-[var(--brand-text-muted)]">· {excelGeocoded} geocodificate</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isGeocoding ? (
                    <>
                      <span className="text-xs text-[var(--warning)]">
                        {geocodingProgress!.done}/{geocodingProgress!.total}
                      </span>
                      <button
                        type="button"
                        onClick={() => { geocodingActiveRef.current = false; setGeocodingProgress(null); }}
                        className="rounded-lg border border-[var(--warning)]/40 bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--warning)]"
                      >
                        Interrompi
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={startGeocoding}
                      disabled={excelTasks.length === 0}
                      className="rounded-lg bg-[var(--warning)] px-3 py-1 text-xs font-medium text-[var(--on-marker)] hover:opacity-90 disabled:opacity-40"
                    >
                      {excelGeocoded > 0 ? 'Riprendi geocodifica' : 'Geocodifica e mostra'}
                    </button>
                  )}
                </div>
              </div>
              {isGeocoding && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--warning)]/20">
                  <div
                    className="h-full rounded-full bg-[var(--warning)] transition-all"
                    style={{ width: `${(geocodingProgress!.done / geocodingProgress!.total) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Pannello distribuzione operatori — >=1 per pianificare anche un solo civico (es. risanamento singolo) */}
            {excelGeocoded >= 1 && !isGeocoding && (
              <div className={`rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2.5 ${currentPhase === 6 ? 'opacity-80' : ''}`}>
                {/* Intestazione + toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--brand-text-main)]">Distribuisci tra operatori</span>
                  <button
                    type="button"
                    onClick={() => setShowOpPicker((v) => !v)}
                    className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
                  >
                    {showOpPicker ? 'Chiudi -' : 'Seleziona +'}
                  </button>
                </div>

                {esecutoreWarnings.length > 0 && (
                  <div className="mt-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-2.5 py-1.5 text-[10px] text-[var(--warning)]">
                    ⚠ Esecutori non riconosciuti (distribuiti automaticamente): {esecutoreWarnings.join(', ')}
                  </div>
                )}

                {assenzaMsg && (
                  <div className="mt-2 rounded-lg border px-2.5 py-1.5 text-[10px]" style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                    {assenzaMsg}{' '}
                    <button type="button" className="underline" onClick={() => setAssenzaMsg(null)}>chiudi</button>
                  </div>
                )}
                {conflittiAssenza.length > 0 && (
                  <div className="mt-2 rounded-lg border px-2.5 py-1.5 text-[10px]" style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                    ⚠ {conflittiAssenza.length} operator{conflittiAssenza.length === 1 ? 'e' : 'i'} ora assent{conflittiAssenza.length === 1 ? 'e' : 'i'} per il {planningDate}: {conflittiAssenza.map((o) => o.name).join(', ')}. Rivedi il piano.
                  </div>
                )}

                {/* Pannello selezione — inline, nessun absolute */}
                {showOpPicker && (
                  <div className="mt-2 space-y-2">
                    {territoryFilteredOperators.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {territoryFilteredOperators.map((operator) => {
                            const selIdx = selectedOps.findIndex((o) => o.id === operator.id);
                            const checked = selIdx !== -1;
                            return (
                              <label key={operator.id} className={`flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--brand-surface)] ${isAssenteIntera(operator.id) ? 'opacity-50' : ''}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleOp(operator)} className="accent-[var(--brand-primary)]" />
                                <span className="truncate text-xs text-[var(--brand-text-main)]">{operator.displayName}</span>
                                {renderAssenzaBadge(operator.id)}
                                {checked && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OP_COLORS[selIdx % OP_COLORS.length] }} />}
                              </label>
                            );
                          })}
                        </div>
                        {territoryFilter && territoryFilteredOperators.length < availableOperators.length && (
                          <p className="text-[10px] text-[var(--brand-text-subtle)] mt-1">
                            Cronoprogramma {planningDate} | {territoryFilteredOperators.length} operatori su {availableOperators.length}
                            {selectedPlanningTerritory ? ` assegnati a ${selectedPlanningTerritory.name}` : ''}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[var(--brand-text-subtle)]">
                        Nessun operatore assegnato nel cronoprogramma
                        {selectedPlanningTerritory ? ` a ${selectedPlanningTerritory.name}` : ''}
                        {' '}per il {planningDate}.
                      </p>
                    )}
                    {territoryFilter && altriOperatori.length > 0 && (
                      <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--brand-border)' }}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">
                          Altri operatori (fuori dal cronoprogramma del territorio)
                        </p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {altriOperatori.map((operator) => {
                            const selIdx = selectedOps.findIndex((o) => o.id === operator.id);
                            const checked = selIdx !== -1;
                            return (
                              <label key={operator.id} className={`flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--brand-surface)] ${isAssenteIntera(operator.id) ? 'opacity-50' : ''}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleOp(operator)} className="accent-[var(--brand-primary)]" />
                                <span className="truncate text-xs text-[var(--brand-text-main)]">{operator.displayName}</span>
                                {renderAssenzaBadge(operator.id)}
                                {checked && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OP_COLORS[selIdx % OP_COLORS.length] }} />}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tabella operatori selezionati con quantità */}
                {selectedOps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Operatore</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)] text-right">N. interventi</span>
                      <span />
                      {selectedOps.map((op, i) => (
                        <React.Fragment key={op.id}>
                          <div key={op.id + '-name'} className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: OP_COLORS[i % OP_COLORS.length] }} />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-[var(--brand-text-main)]">{op.name}</div>
                              {(() => {
                                const a = assenzeByStaff[op.id];
                                if (!a || !isAssenzaIntera(a)) return null;
                                return (
                                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                                    ⚠ ora in {a.tipo}
                                  </span>
                                );
                              })()}
                              {op.startAddress && (
                                <div className="truncate text-[10px] text-[var(--brand-text-subtle)]">{op.startAddress}</div>
                              )}
                              {(() => {
                                const r = rapByStaff.get(op.id);
                                if (!r) return null;
                                const badge = statoBadge(r.statoCalcolato);
                                return (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLink(r)}
                                      className="rounded bg-[var(--brand-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)]"
                                    >
                                      {copiedToken === r.token ? '✓ Copiato!' : '🔗 Copia link'}
                                    </button>
                                    <a
                                      href={whatsappHref(r.staff_name, rapDataLabel, r.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--success)] hover:opacity-80"
                                    >
                                      WhatsApp
                                    </a>
                                    <a
                                      href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                                      className="rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                                    >
                                      Excel
                                    </a>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          <input
                            key={op.id + '-qty'}
                            type="number"
                            min={0}
                            value={op.qty || ''}
                            onChange={(e) => changeOpQty(op.id, parseInt(e.target.value, 10) || 0)}
                            placeholder="auto"
                            className="w-16 rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1.5 py-0.5 text-xs text-right"
                          />
                          <button
                            key={op.id + '-rm'}
                            type="button"
                            onClick={() => setSelectedOps((prev) => prev.filter((o) => o.id !== op.id))}
                            className="text-xs text-[var(--brand-text-subtle)] hover:text-[var(--danger)]"
                          >
                            ×
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                    <p className="text-[10px] text-[var(--brand-text-subtle)]">Lascia vuoto per distribuzione automatica uguale.</p>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => setAssignModalOpen(true)}
                        className="rounded-xl border border-[var(--brand-border)] px-4 py-2 text-sm font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]">
                        📌 Assegnazioni manuali{manualRules.length ? ` (${manualRules.length})` : ''}
                      </button>
                      <button type="button" onClick={distributeToOps} className="rounded-lg bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)]">
                        {selectedOps.length === 1 ? 'Assegna' : 'Distribuisci'}
                      </button>
                      {distribution && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDistribution(null);
                              setUnassignedTasks([]);
                              setZtlConflicts([]);
                              if (isEditMode) {
                                setCurrentPianoId(undefined);
                                window.history.replaceState({}, '', '/hub/mappa?vista=pianifica');
                              }
                            }}
                            className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
                          >
                            Azzera
                          </button>
                        </>
                      )}
                    </div>
                    {rapError && (
                      <p className="text-[10px] text-[var(--danger)]">{rapError}</p>
                    )}
                  </div>
                )}

                {distribution !== null && excelMode && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-[var(--brand-text-muted)]">
                      Completamento: {geocodificati} / {totalQtyRichiesta}
                    </span>
                  </div>
                )}

                {templateGeocoding && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-[var(--brand-text-muted)] mb-1">
                      <span>Geocodifica template</span>
                      <span>{templateGeocoding.done} / {templateGeocoding.total}</span>
                    </div>
                    <div className="h-1 bg-[var(--brand-border)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--brand-violet)] transition-all"
                        style={{
                          width: `${templateGeocoding.total > 0 ? (templateGeocoding.done / templateGeocoding.total) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner conflitti ZTL */}
      {ztlConflicts.length > 0 && (
        <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--warning)]">
              ⚠ {ztlConflicts.length} conflitt{ztlConflicts.length === 1 ? 'o' : 'i'} ZTL
            </span>
            <button
              type="button"
              onClick={() => setZtlConflicts([])}
              className="ml-auto text-xs text-[var(--warning)] hover:opacity-80"
            >
              Chiudi
            </button>
          </div>
          <ul className="space-y-1">
            {ztlConflicts.map((c, i) => (
              <li key={i} className="text-xs text-[var(--warning)]">• {c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
            Usa &quot;Sposta&quot; per riassegnare le attività ZTL agli operatori autorizzati.
          </p>
        </div>
      )}

      {/* Mappa + pannello laterale */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="isolate rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm">
          <div ref={mapRef} className="h-[520px] w-full rounded-2xl" />
        </div>

        <div className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm overflow-y-auto max-h-[540px] ${
          currentPhase >= 4 ? 'border-[var(--brand-primary-border)]' : 'border-[var(--brand-border)]'
        }`}>
          {/* ── Distribuzione operatori ── */}
          {excelMode && distribution ? (
            <>
              {/* Barra di ricerca interventi (tra tutti gli operatori) */}
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca intervento (ODL o indirizzo)…"
                  className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-1.5 text-xs text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
                />
                {searchQuery.trim() && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)]">
                    {risultatiRicerca.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[var(--brand-text-subtle)]">Nessun intervento trovato</div>
                    ) : (
                      risultatiRicerca.map((r) => (
                        <button
                          key={r.taskId}
                          type="button"
                          onClick={() => { setActiveOpIdx(r.opIdx); focusExcelTask(r.taskId); setSearchQuery(''); }}
                          className="flex w-full items-start gap-2 border-b border-[var(--brand-border)] px-3 py-1.5 text-left last:border-0 hover:bg-[var(--brand-surface-muted)]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-[var(--brand-text-main)]">{r.odl || r.indirizzo || r.taskId}</span>
                            {r.indirizzo && <span className="block truncate text-[10px] text-[var(--brand-text-muted)]">{r.indirizzo}</span>}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--brand-surface-muted)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--brand-text-muted)]">{r.opName.split(' ')[0]}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

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
                        ? { backgroundColor: d.color, color: 'var(--on-marker)' }
                        : { backgroundColor: 'var(--brand-surface-muted)', color: 'var(--brand-text-muted)' }
                    }
                  >
                    {(d.op ?? d.staffId ?? '?').split(' ')[0]} <span className="opacity-80">({d.tasks.length})</span>
                  </button>
                ))}
              </div>

              {distribution[activeOpIdx] && (() => {
                const { op, color, tasks, km, startAddress, schedule } = distribution[activeOpIdx];
                return (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold">{op ?? 'Operatore'}</span>
                        {startAddress && (
                          <div className="truncate text-[10px] text-[var(--brand-text-subtle)]">Partenza: {startAddress}</div>
                        )}
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold text-[var(--on-marker)]"
                        style={{ backgroundColor: color }}
                      >
                        {km} km
                      </span>
                    </div>
                      {distribution!.length > 1 && tasks.some((t) => t.stato !== 'completato') && (
                        <div className="mb-2">
                          <button
                            type="button"
                            onClick={() => setMovingAllOpen((v) => !v)}
                            className="rounded-md border border-[var(--brand-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-text-subtle)] transition hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]"
                          >
                            ⇄ Sposta tutti a…
                          </button>
                          {movingAllOpen && (
                            <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[var(--brand-border)] pt-1.5">
                              <span className="w-full text-[10px] text-[var(--brand-text-subtle)]">Sposta tutti gli interventi a:</span>
                              {selectedOps.map((op, opSelIdx) => {
                                if (op.id === distribution![activeOpIdx].staffId) return null;
                                const count = distribution!.find((d) => d.staffId === op.id)?.tasks.length ?? 0;
                                return (
                                  <button
                                    key={op.id}
                                    type="button"
                                    onClick={() => moveAllTasks(activeOpIdx, op, opSelIdx)}
                                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--on-marker)] transition hover:opacity-80"
                                    style={{ backgroundColor: OP_COLORS[opSelIdx % OP_COLORS.length] }}
                                  >
                                    {op.name ?? 'Operatore'} ({count})
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {tasks.map((t, idx) => {
                          const isMoving = movingTaskId === t.id;
                          const isSelected = selectedExcelTaskId === t.id;
                          return (
                            <div
                              key={t.id}
                              ref={(node) => { excelTaskItemRefs.current[t.id] = node; }}
                              className={`rounded-lg border px-2 py-1.5 transition ${
                                isSelected ? 'border-[var(--warning)]/40 bg-[var(--warning-soft)] shadow-sm' : 'border-[var(--brand-border)]'
                              } ${t.annullato ? 'line-through opacity-70 border-[var(--danger)]/40' : ''}`}
                            >
                              <div className="flex items-start gap-2">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[var(--on-marker)]" style={{ backgroundColor: color }}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1 text-xs">
                                <div className="truncate font-medium">{t.odl || `#${idx + 1}`}</div>
                                <div className="truncate text-[var(--brand-text-muted)]">{t.indirizzo}{t.citta ? `, ${t.citta}` : ''}</div>
                                {t.fascia_oraria && <div className="text-[var(--brand-text-subtle)]">{t.fascia_oraria}</div>}
                                {(() => {
                                  const sched = schedule?.find((s) => s.taskId === t.id);
                                  if (!sched) return null;
                                  return (
                                    <div className={sched.inRitardo ? 'font-medium text-[var(--warning)]' : 'text-[var(--brand-text-subtle)]'}>
                                      ETA {formatEtaMin(sched.etaMin)}{sched.inRitardo ? ' · in ritardo' : ''}
                                    </div>
                                  );
                                })()}
                              </div>
                              <button
                                type="button"
                                onClick={() => setMovingTaskId(isMoving ? null : t.id)}
                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${isMoving ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'border-[var(--brand-border)] text-[var(--brand-text-subtle)] hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]'}`}
                              >
                                Sposta
                              </button>
                              {t.stato !== 'completato' && (
                                <button
                                  type="button"
                                  onClick={() => toggleAnnullaTask(t.id, activeOpIdx)}
                                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${t.annullato ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]' : 'border-[var(--brand-border)] text-[var(--brand-text-subtle)] hover:border-[var(--danger)] hover:text-[var(--danger)]'}`}
                                >
                                  {t.annullato ? 'Ripristina' : 'Annulla'}
                                </button>
                              )}
                              {t.stato !== 'completato' && (
                                <button
                                  type="button"
                                  onClick={() => eliminaTask(t.id, activeOpIdx)}
                                  className="shrink-0 rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-text-subtle)] transition hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                                >
                                  Elimina
                                </button>
                              )}
                            </div>
                            {/* Selettore operatore destinazione */}
                            {isMoving && (
                              <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[var(--brand-border)] pt-1.5">
                                <span className="text-[10px] text-[var(--brand-text-subtle)] w-full">Sposta a:</span>
                                {selectedOps.map((op, opSelIdx) => {
                                  if (op.id === distribution![activeOpIdx].staffId) return null;
                                  const ztl = getTaskZtl(t.cap, ztlZones);
                                  const blocked = ztl !== null && !ztl.authorized_staff_ids.includes(op.id);
                                  const count = distribution!.find((d) => d.staffId === op.id)?.tasks.length ?? 0;
                                  return (
                                    <button
                                      key={op.id}
                                      type="button"
                                      onClick={() => !blocked && moveTask(t.id, activeOpIdx, op, opSelIdx)}
                                      disabled={blocked}
                                      title={blocked ? `${op.name ?? 'Operatore'} non ha il permesso ZTL per ${ztl!.name}` : undefined}
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--on-marker)] transition ${blocked ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80'}`}
                                      style={{ backgroundColor: OP_COLORS[opSelIdx % OP_COLORS.length] }}
                                    >
                                      {op.name ?? 'Operatore'} ({count}) {blocked ? '🔒' : ''}
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
                      <div className="mt-4 border-t border-[var(--warning)]/30 pt-3">
                        <div className="mb-2 text-sm font-semibold text-[var(--warning)]">
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
                                    ? 'border-[var(--warning)]/50 bg-[var(--warning-soft)] shadow-sm'
                                    : 'border-[var(--warning)]/25 bg-[var(--warning-soft)]'
                                }`}
                              >
                                <div
                                  className="flex cursor-pointer items-start gap-1.5"
                                  onClick={() => focusExcelTask(t.id)}
                                >
                                  <span className="mt-0.5 shrink-0 text-[9px] font-bold text-[var(--warning)]">{idx + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      <span className="truncate font-medium">{t.odl || `Task ${idx + 1}`}</span>
                                      {isSelected && (
                                        <span className="shrink-0 rounded-full border border-[var(--warning)]/40 bg-[var(--brand-surface)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">
                                          Selezionato
                                        </span>
                                      )}
                                    </div>
                                    <div className="truncate text-[var(--brand-text-muted)]">{t.indirizzo}{t.citta ? ` · ${t.citta}` : ''}</div>
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
                                          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                                          : 'border-[var(--brand-border)] text-[var(--brand-text-subtle)] hover:border-[var(--brand-primary-border)] hover:text-[var(--brand-primary)]'
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
                                      className="rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[10px] text-[var(--brand-text-muted)] hover:border-[var(--warning)]/40 hover:bg-[var(--warning-soft)] hover:text-[var(--warning)]"
                                      title="Correggi indirizzo e rigenera coordinate"
                                    >
                                      Correggi
                                    </button>
                                  </div>
                                </div>
                                {isMoving && (
                                  <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[var(--warning)]/30 pt-1.5">
                                    <span className="w-full text-[10px] text-[var(--warning)]">Sposta a:</span>
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
                                              ? `${d.op ?? 'Operatore'} non ha il permesso ZTL per ${ztl!.name}`
                                              : undefined
                                          }
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--on-marker)] transition ${
                                            blocked ? 'cursor-not-allowed opacity-30' : 'hover:opacity-80'
                                          }`}
                                          style={{ backgroundColor: d.color }}
                                        >
                                          {d.op ?? 'Operatore'} ({d.tasks.length}){blocked ? ' ZTL' : ''}
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
                <span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-primary)]">
                  {routeResult.totalDistanceKm} km
                </span>
              </div>
              <div className="space-y-2">
                {routeResult.orderedTasks.map((task, idx) => {
                  const row = rowById.get(task.id);
                  const op = (task as Task & { _operatore?: string })._operatore;
                  return (
                    <div key={task.id} className="flex items-start gap-2 rounded-xl border border-[var(--brand-border)] p-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[10px] font-bold text-[var(--on-primary)]">
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
                              <span className="rounded border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-1 text-[10px] font-bold text-[var(--danger)]">REP</span>
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
              <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 space-y-2 border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 pt-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--warning)]">Attivita da Excel</div>
                  <span className="text-[10px] font-medium text-[var(--brand-text-subtle)]">
                    {filteredExcelTasks.length}/{excelTasks.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setExcelOnlyManualAction((value) => !value)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                      excelOnlyManualAction
                        ? 'border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)]'
                        : 'border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-muted)] hover:border-[var(--warning)]/30 hover:text-[var(--warning)]'
                    }`}
                  >
                    Solo da correggere ({excelNeedsManualCount})
                  </button>
                  {excelOnlyManualAction && (
                    <button
                      type="button"
                      onClick={() => setExcelOnlyManualAction(false)}
                      className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-text-muted)] transition hover:border-[var(--brand-border-strong)] hover:text-[var(--brand-text-main)]"
                    >
                      Reset filtri
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Operatori coinvolti</div>
                  {excelOperators.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {excelOperators.map((name) => (
                        <span
                          key={name}
                          className="max-w-full truncate rounded-full border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]"
                          title={name}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--brand-text-subtle)]">Nessun operatore selezionato.</div>
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
                          ? 'border-[var(--warning)]/50 bg-[var(--warning-soft)] shadow-sm'
                          : hasCoords
                            ? 'border-[var(--warning)]/25 bg-[var(--warning-soft)]'
                            : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)]'
                      }`}
                    >
                      {isEditing ? (
                        /* Form modifica indirizzo */
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold text-[var(--brand-text-muted)] uppercase tracking-wide">Modifica indirizzo</div>
                          <input
                            type="text"
                            value={editDraft.indirizzo}
                            onChange={(e) => setEditDraft((d) => ({ ...d, indirizzo: e.target.value }))}
                            placeholder="Indirizzo..."
                            className="w-full rounded border border-[var(--brand-border)] px-1.5 py-1 text-xs"
                          />
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={editDraft.cap}
                              onChange={(e) => setEditDraft((d) => ({ ...d, cap: e.target.value }))}
                              placeholder="CAP"
                              className="w-20 rounded border border-[var(--brand-border)] px-1.5 py-1 text-xs"
                            />
                            <input
                              type="text"
                              value={editDraft.citta}
                              onChange={(e) => setEditDraft((d) => ({ ...d, citta: e.target.value }))}
                              placeholder="Città..."
                              className="min-w-0 flex-1 rounded border border-[var(--brand-border)] px-1.5 py-1 text-xs"
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
                              className="flex-1 rounded bg-[var(--warning)] py-1 text-xs font-medium text-[var(--on-marker)] hover:opacity-90 disabled:opacity-50"
                            >
                              {isSaving ? 'Geocodifica...' : 'Salva e geocodifica'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTaskId(null);
                              }}
                              className="rounded border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
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
                          <span className="mt-0.5 shrink-0 text-[9px] font-bold text-[var(--warning)]">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate font-medium">{op || t.odl || `Task ${idx + 1}`}</span>
                              {isSelected && (
                                <span className="shrink-0 rounded-full border border-[var(--warning)]/40 bg-[var(--brand-surface)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)]">
                                  Selezionato
                                </span>
                              )}
                              {hasCoords && (
                                <span className="shrink-0 text-[9px] text-[var(--success)]">✓</span>
                              )}
                              {(() => {
                                const ztl = getTaskZtl(t.cap, ztlZones);
                                return ztl ? (
                                  <span className="shrink-0 rounded-full bg-[var(--warning-soft)] border border-[var(--warning)]/40 px-1.5 py-0.5 text-[9px] font-bold text-[var(--warning)] uppercase tracking-wide">
                                    ZTL · {ztl.name}
                                  </span>
                                ) : null;
                              })()}
                              {t.isAppointment && (
                                <span className="shrink-0 rounded-full bg-[var(--brand-violet-soft)] border border-[var(--brand-violet)]/40 px-1.5 py-0.5 text-[9px] font-bold text-[var(--brand-violet)] uppercase tracking-wide">
                                  APT
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[var(--brand-text-muted)]">{t.indirizzo}{t.citta ? ` · ${t.citta}` : ''}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(t);
                            }}
                            className="shrink-0 rounded border border-[var(--brand-border)] px-1.5 py-0.5 text-[10px] text-[var(--brand-text-muted)] hover:border-[var(--warning)]/40 hover:bg-[var(--warning-soft)] hover:text-[var(--warning)]"
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
                  <div className="rounded-xl border border-dashed border-[var(--brand-border)] px-3 py-4 text-center text-xs text-[var(--brand-text-subtle)]">
                    Nessun indirizzo corrisponde ai filtri correnti.
                  </div>
                )}
              </div>
            </>
          ) : excelMode ? (
            /* ── Supabase: operatori senza coordinate (solo in Excel mode) ── */
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
                          <span className="rounded border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-1 text-[10px] font-bold text-[var(--danger)]">REP</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--brand-text-muted)]">Tutti gli operatori hanno coordinate.</div>
              )}
            </>
          ) : filteredAppointmentTasks.length > 0 ? (
            /* ── Lista appuntamenti del giorno ── */
            <div className="space-y-2">
              <div className="mb-3 text-sm font-semibold text-[var(--brand-violet)]">
                Appuntamenti · {planningDate}
              </div>
              {filteredAppointmentTasks
                .map(t => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-[var(--brand-violet)]/30 bg-[var(--brand-violet-soft)] px-3 py-2.5 text-xs cursor-pointer hover:bg-[var(--brand-violet-soft)]"
                    onClick={() => setSelectedExcelTaskId(t.id)}
                  >
                    <div className="font-semibold text-[var(--brand-text-main)]">{(t as Task & { pdr?: string }).pdr ?? t.id}</div>
                    <div className="mt-0.5 text-[var(--brand-text-main)]">{t.indirizzo}</div>
                    <div className="text-[var(--brand-text-muted)]">{t.cap} {t.citta}</div>
                    {t.fascia_oraria && <div className="mt-0.5 text-[var(--brand-text-subtle)]">{t.fascia_oraria}</div>}
                    {t.lat == null && <div className="mt-1 text-[10px] text-[var(--warning)]">⚠ Geocodifica in corso...</div>}
                  </div>
                ))
              }
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--brand-text-muted)]">
              Carica un file Excel o aggiungi appuntamenti per visualizzare gli interventi.
            </div>
          )}
        </div>
      </div>

      {distribution !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-text-main)]">
            Conferma piano
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {/* Scelta modello rapportino PRIMA del salvataggio/generazione:
                il salvataggio auto-genera i rapportini, quindi il template va
                scelto a monte. Obbligatorio e bloccante quando esistono modelli. */}
            <label className="flex items-center gap-1.5 text-xs text-[var(--brand-text-muted)]">
              <span className="font-medium">Modello:</span>
              <select
                value={rapTemplateId}
                onChange={(e) => setRapTemplateId(e.target.value)}
                title="Modello rapportino"
                className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)]"
              >
                {rapTemplates.length === 0
                  ? <option value="">Nessun modello</option>
                  : <option value="">— Seleziona modello —</option>}
                {rapTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}{t.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={saveDistribution}
              disabled={savingDistribution || (rapTemplates.length > 0 && !rapTemplateId)}
              title={rapTemplates.length > 0 && !rapTemplateId ? 'Seleziona prima un modello rapportino' : undefined}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                savedDistribution
                  ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/40'
                  : 'bg-[var(--brand-primary)] text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)]'
              } disabled:opacity-50`}
            >
              {savingDistribution
                ? 'Salvataggio...'
                : savedDistribution && currentPianoId
                  ? '✓ Salvata'
                  : 'Salva distribuzione'}
            </button>
            {currentPianoId && (
              <button
                type="button"
                onClick={generaRapportini}
                disabled={rapGenerating || !rapTemplateId}
                title={!rapTemplateId ? 'Nessun modello attivo' : undefined}
                className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50"
              >
                {rapGenerating
                  ? 'Genero…'
                  : rapStato.length > 0
                    ? '↻ Rigenera rapportini'
                    : '📋 Genera rapportini'}
              </button>
            )}
          </div>
        </div>
      )}

      <ManualAssignmentsModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        operators={selectedOps.map((o) => ({ id: o.id, name: o.name }))}
        tasks={excelTasks}
        rules={manualRules}
        locks={operatorLocks}
        manualiLiberi={operatorFreeLane}
        onChangeRules={setManualRules}
        onChangeLocks={setOperatorLocks}
        onChangeManualiLiberi={setOperatorFreeLane}
        onDistribute={() => { setAssignModalOpen(false); distributeToOps(); }}
      />
      {manualModalOpen && (
        <ManualTaskModal
          operators={
            distribution && selectedOps.length > 0
              ? selectedOps.map((o) => ({ id: o.id, displayName: o.name }))
              : operatorOptions.map((o) => ({ id: o.id, displayName: o.displayName }))
          }
          onClose={() => setManualModalOpen(false)}
          onAdd={addManualTask}
        />
      )}
      {rapConflicts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRapConflicts(null)}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Rapportini già esistenti</h3>
            <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
              Questi operatori hanno già un rapportino su questo territorio/giorno da un altro piano:
            </p>
            <ul className="my-3 max-h-52 space-y-1 overflow-y-auto text-sm">
              {rapConflicts.map((c) => (
                <li key={c.staff_id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] px-3 py-1.5">
                  <span>{c.staff_name ?? c.staff_id}</span>
                  {c.submitted && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]">già inviato</span>}
                </li>
              ))}
            </ul>
            {rapConflicts.some((c) => c.submitted) && (
              <label className="mb-3 flex items-center gap-2 text-xs text-[var(--danger)]">
                <input type="checkbox" checked={overwriteInviati} onChange={(e) => setOverwriteInviati(e.target.checked)} />
                Sovrascrivi anche i rapportini già inviati (i dati compilati andranno persi)
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setRapConflicts(null); setOverwriteInviati(false); }} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm">Annulla</button>
              <button type="button" onClick={() => void eseguiGenerazione('skip')} disabled={rapGenerating} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm disabled:opacity-50">Salta esistenti</button>
              <button
                type="button"
                onClick={() => void eseguiGenerazione('replace', overwriteInviati)}
                disabled={rapGenerating || (rapConflicts.some((c) => c.submitted) && !overwriteInviati)}
                className="rounded-lg bg-[var(--danger)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Sovrascrivi tutti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
