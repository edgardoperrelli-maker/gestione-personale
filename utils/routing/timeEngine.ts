import { haversine } from './distance';
import type { Task, ScheduleEntry, OperatorBase } from './types';

/** Durata usata quando il task non porta `durata_min`. */
export const DURATA_DEFAULT_MIN = 30;
/** Velocità media (km/h) per stimare il tempo di viaggio dalla distanza Haversine (linea d'aria). */
export const VELOCITA_MEDIA_KMH = 25;
/** Inizio giornata in minuti da mezzanotte (08:00). */
export const ORARIO_INIZIO_MIN = 480;

export type FasciaWindow = { startMin: number; endMin: number | null };
export type ScheduleOpts = { startMin?: number; speedKmh?: number; durataDefaultMin?: number };

/**
 * Estrae la finestra oraria (minuti da mezzanotte) da una stringa fascia.
 * Gestisce "08:00-12:00", "8-12", "08:00" (solo inizio), "9:30". Non parsabile → null.
 */
export function parseFasciaWindow(s: string | null | undefined): FasciaWindow | null {
  if (!s) return null;
  const matches = Array.from(String(s).matchAll(/(\d{1,2})(?::(\d{2}))?/g));
  if (!matches.length) return null;
  const toMin = (m: RegExpMatchArray): number => {
    const h = parseInt(m[1], 10);
    const min = m[2] != null ? parseInt(m[2], 10) : 0;
    return h * 60 + min;
  };
  const startMin = toMin(matches[0]);
  if (Number.isNaN(startMin)) return null;
  const endRaw = matches.length >= 2 ? toMin(matches[1]) : null;
  return { startMin, endMin: endRaw != null && !Number.isNaN(endRaw) ? endRaw : null };
}

/** Minuti da mezzanotte → "HH:MM" (24h, clamp a >= 0). */
export function formatEtaMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function travelMin(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
  speedKmh: number,
): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  return (haversine(a.lat, a.lng, b.lat, b.lng) / speedKmh) * 60;
}

/**
 * Calcola l'ETA (orario di arrivo, minuti da mezzanotte) per ogni tappa della
 * sequenza GIÀ ordinata, accumulando viaggio + durata. `inRitardo` se l'arrivo
 * supera la fine della finestra oraria del task. Puro.
 */
export function computeSchedule(
  orderedTasks: Task[],
  base: OperatorBase | null | undefined,
  opts?: ScheduleOpts,
): ScheduleEntry[] {
  const startMin = opts?.startMin ?? ORARIO_INIZIO_MIN;
  const speedKmh = opts?.speedKmh != null && opts.speedKmh > 0 ? opts.speedKmh : VELOCITA_MEDIA_KMH;
  const durataDefaultMin = opts?.durataDefaultMin ?? DURATA_DEFAULT_MIN;

  const schedule: ScheduleEntry[] = [];
  let clock = startMin;
  let prev: { lat?: number; lng?: number } | null = base ? { lat: base.lat, lng: base.lng } : null;

  for (const t of orderedTasks) {
    if (prev) clock += travelMin(prev, t, speedKmh);
    const win = parseFasciaWindow(t.fascia_oraria);
    const inRitardo = win != null && win.endMin != null && clock > win.endMin;
    schedule.push({ taskId: t.id, etaMin: Math.round(clock), inRitardo });
    clock += t.durata_min ?? durataDefaultMin;
    prev = { lat: t.lat, lng: t.lng };
  }
  return schedule;
}
