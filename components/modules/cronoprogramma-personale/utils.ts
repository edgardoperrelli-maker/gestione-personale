import type { Assignment } from '@/types';
import type { SortMode } from './types';

export type AssignmentDragPayload = {
  id: string;
  fromDay: string;
  fromTerritoryId: string | null;
};

export function toLocalDate(d: Date, tzLocal: string) {
  const s = d.toLocaleString('sv-SE', { timeZone: tzLocal });
  return new Date(s.replace(' ', 'T'));
}

export function startOfWeek(d: Date) {
  const dd = new Date(d);
  const day = (dd.getDay() + 6) % 7;
  dd.setDate(dd.getDate() - day);
  dd.setHours(0, 0, 0, 0);
  return dd;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  m.setHours(0, 0, 0, 0);
  return m;
}

export function endOfMonth(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  m.setHours(0, 0, 0, 0);
  return m;
}

export function fmtDay(d: Date) {
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export function eqDate(a: Date, b: Date) {
  return fmtDay(a) === fmtDay(b);
}

export function sortAssignments(items: Assignment[], mode: SortMode): Assignment[] {
  const name = (a: Assignment) => a.staff?.display_name ?? '';
  const act = (a: Assignment) => a.activity?.name ?? '';
  const terr = (a: Assignment) => a.territory?.name ?? '';
  const cmp = (a: string, b: string) => a.localeCompare(b, 'it', { sensitivity: 'base' });
  const arr = [...items];
  switch (mode) {
    case 'REPERIBILE':
      return arr.sort((a, b) => Number(b.reperibile) - Number(a.reperibile) || cmp(name(a), name(b)));
    case 'ATTIVITA':
      return arr.sort(
        (a, b) => cmp(a.activity ? act(a) : 'zzzz', b.activity ? act(b) : 'zzzz') || cmp(name(a), name(b))
      );
    case 'TERRITORIO':
    case 'PER_TERRITORIO':
      return arr.sort(
        (a, b) => cmp(a.territory ? terr(a) : 'zzzz', b.territory ? terr(b) : 'zzzz') || cmp(name(a), name(b))
      );
    case 'SENZA_ATTIVITA':
      return arr.sort((a, b) => (a.activity ? 1 : 0) - (b.activity ? 1 : 0) || cmp(name(a), name(b)));
    case 'AZ':
    default:
      return arr.sort((a, b) => cmp(name(a), name(b)));
  }
}

export function filterAssignments(items: Assignment[], tokens: string[]): Assignment[] {
  if (!tokens || tokens.length === 0) return items;

  const groups: Record<string, string[]> = {};
  for (const t of tokens) {
    const k = t.includes(':') ? t.split(':', 1)[0] : t;
    (groups[k] ??= []).push(t);
  }

  return items.filter((a) => {
    if (groups['REPERIBILE'] && !a.reperibile) return false;

    if (groups['STAFF']) {
      const ok = groups['STAFF'].some((t) => a.staff?.id === t.slice(6));
      if (!ok) return false;
    }
    if (groups['ACT']) {
      const ok = groups['ACT'].some((t) => a.activity?.id === t.slice(4));
      if (!ok) return false;
    }
    if (groups['TERR']) {
      const ok = groups['TERR'].some((t) => a.territory?.id === t.slice(5));
      if (!ok) return false;
    }
    if (groups['CC']) {
      const ok = groups['CC'].some((t) => a.cost_center === t.slice(3));
      if (!ok) return false;
    }
    return true;
  });
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function indexDays(rows: { id: string; day: string }[]) {
  const m: Record<string, { id: string; day: string }> = {};
  rows?.forEach((r) => {
    m[r.day] = r;
  });
  return m;
}

export function indexDayIds(rows: { id: string; day: string }[]) {
  const m: Record<string, string> = {};
  rows?.forEach((r) => {
    m[r.id] = r.day;
  });
  return m;
}

export function writeAssignmentDragData(
  dataTransfer: DataTransfer,
  payload: AssignmentDragPayload
) {
  const raw = JSON.stringify(payload);
  dataTransfer.effectAllowed = 'copyMove';
  dataTransfer.setData('application/json', raw);
  dataTransfer.setData('text/plain', raw);
}

export function readAssignmentDragData(dataTransfer: DataTransfer): AssignmentDragPayload | null {
  const raw = dataTransfer.getData('application/json') || dataTransfer.getData('text/plain');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AssignmentDragPayload>;
    if (typeof parsed.id !== 'string' || typeof parsed.fromDay !== 'string') return null;
    return {
      id: parsed.id,
      fromDay: parsed.fromDay,
      fromTerritoryId:
        typeof parsed.fromTerritoryId === 'string' || parsed.fromTerritoryId === null
          ? parsed.fromTerritoryId
          : null,
    };
  } catch {
    return null;
  }
}

export function isCopyDropGesture(e: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  dataTransfer: DataTransfer;
}) {
  return e.altKey || e.ctrlKey || e.metaKey || e.dataTransfer.dropEffect === 'copy';
}
