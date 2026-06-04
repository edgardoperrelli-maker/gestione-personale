import { describe, it, expect } from 'vitest';
import { parseFasciaWindow, computeSchedule, formatEtaMin } from './timeEngine';
import type { Task } from './types';

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over };
}

describe('parseFasciaWindow', () => {
  it('parsa HH:MM-HH:MM', () => {
    expect(parseFasciaWindow('08:00-12:00')).toEqual({ startMin: 480, endMin: 720 });
  });
  it('parsa ore intere con trattino', () => {
    expect(parseFasciaWindow('8-12')).toEqual({ startMin: 480, endMin: 720 });
  });
  it('solo inizio → endMin null', () => {
    expect(parseFasciaWindow('08:00')).toEqual({ startMin: 480, endMin: null });
  });
  it('ore e minuti singola', () => {
    expect(parseFasciaWindow('9:30')).toEqual({ startMin: 570, endMin: null });
  });
  it('vuoto / null / non parsabile → null', () => {
    expect(parseFasciaWindow('')).toBeNull();
    expect(parseFasciaWindow(null)).toBeNull();
    expect(parseFasciaWindow(undefined)).toBeNull();
    expect(parseFasciaWindow('mattina')).toBeNull();
  });
});

describe('formatEtaMin', () => {
  it('formatta minuti da mezzanotte in HH:MM', () => {
    expect(formatEtaMin(480)).toBe('08:00');
    expect(formatEtaMin(540)).toBe('09:00');
    expect(formatEtaMin(483)).toBe('08:03');
    expect(formatEtaMin(0)).toBe('00:00');
  });
});

describe('computeSchedule', () => {
  it('solo durate (no coordinate, base null): ETA cumulativo dai default', () => {
    const tasks = [task('a'), task('b'), task('c')];
    const s = computeSchedule(tasks, null);
    expect(s.map((e) => e.etaMin)).toEqual([480, 510, 540]);
    expect(s.map((e) => e.taskId)).toEqual(['a', 'b', 'c']);
    expect(s.every((e) => !e.inRitardo)).toBe(true);
  });

  it('usa durata_min del task quando presente', () => {
    const tasks = [task('a', { durata_min: 60 }), task('b')];
    const s = computeSchedule(tasks, null);
    expect(s.map((e) => e.etaMin)).toEqual([480, 540]);
  });

  it('segnala inRitardo se l\'arrivo supera la fine finestra', () => {
    const tasks = [task('a', { durata_min: 60 }), task('b', { fascia_oraria: '08:00-08:30' })];
    const s = computeSchedule(tasks, null);
    expect(s[1].inRitardo).toBe(true);
    expect(s[0].inRitardo).toBe(false);
  });

  it('finestra senza fine (endMin null) non è mai in ritardo', () => {
    const tasks = [task('a', { durata_min: 600, fascia_oraria: '08:00' })];
    const s = computeSchedule(tasks, null);
    expect(s[0].inRitardo).toBe(false);
  });

  it('con base lontana, la prima ETA include il viaggio', () => {
    const base = { lat: 41, lng: 12 };
    const tasks = [task('a', { lat: 42, lng: 12 })];
    const s = computeSchedule(tasks, base);
    expect(s[0].etaMin).toBeGreaterThan(740);
    expect(s[0].etaMin).toBeLessThan(760);
  });

  it('rispetta opts (startMin, durataDefaultMin)', () => {
    const s = computeSchedule([task('a'), task('b')], null, { startMin: 600, durataDefaultMin: 15 });
    expect(s.map((e) => e.etaMin)).toEqual([600, 615]);
  });

  it('lista vuota → []', () => {
    expect(computeSchedule([], null)).toEqual([]);
  });
});
