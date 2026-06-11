import { describe, it, expect } from 'vitest';
import {
  parseIso,
  toIso,
  formatDisplay,
  buildMonthGrid,
  monthLabel,
  WEEKDAY_LABELS_IT,
} from './datePickerUtils';

describe('parseIso', () => {
  it('parsa una data ISO canonica', () => {
    expect(parseIso('2026-06-11')).toEqual({ y: 2026, m: 6, d: 11 });
  });
  it('ritorna null su vuoto o formato errato', () => {
    expect(parseIso('')).toBeNull();
    expect(parseIso('11/06/2026')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('2026-06-32')).toBeNull();
  });
});

describe('toIso', () => {
  it('formatta con zero-padding', () => {
    expect(toIso(2026, 6, 1)).toBe('2026-06-01');
    expect(toIso(2026, 12, 25)).toBe('2026-12-25');
  });
});

describe('parseIso/toIso round-trip (no shift fuso)', () => {
  it('mantiene lo stesso giorno', () => {
    const iso = '2026-06-11';
    const p = parseIso(iso)!;
    expect(toIso(p.y, p.m, p.d)).toBe(iso);
  });
});

describe('formatDisplay', () => {
  it('rende dd/mm/yyyy', () => {
    expect(formatDisplay('2026-06-11')).toBe('11/06/2026');
  });
  it('ritorna stringa vuota su input non valido', () => {
    expect(formatDisplay('')).toBe('');
    expect(formatDisplay('garbage')).toBe('');
  });
});

describe('monthLabel', () => {
  it('rende mese italiano + anno', () => {
    expect(monthLabel(2026, 6)).toBe('Giugno 2026');
    expect(monthLabel(2026, 1)).toBe('Gennaio 2026');
  });
});

describe('WEEKDAY_LABELS_IT', () => {
  it('è lunedì-first', () => {
    expect(WEEKDAY_LABELS_IT).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
  });
});

describe('buildMonthGrid', () => {
  it('produce 42 celle (6 settimane)', () => {
    expect(buildMonthGrid(2026, 6)).toHaveLength(42);
  });
  it('la prima cella è sempre un lunedì', () => {
    const grid = buildMonthGrid(2026, 2);
    const first = grid[0];
    expect(new Date(first.y, first.m - 1, first.d).getDay()).toBe(1); // 1 = lunedì
  });
  it('giugno 2026 parte di lunedì → prima cella = 2026-06-01 inMonth', () => {
    const grid = buildMonthGrid(2026, 6);
    expect(grid[0].iso).toBe('2026-06-01');
    expect(grid[0].inMonth).toBe(true);
  });
  it('febbraio 2026 parte di domenica → prima cella = 2026-01-26 fuori mese, il giorno 1 è all’indice 6', () => {
    const grid = buildMonthGrid(2026, 2);
    expect(grid[0].iso).toBe('2026-01-26');
    expect(grid[0].inMonth).toBe(false);
    expect(grid[6].iso).toBe('2026-02-01');
    expect(grid[6].inMonth).toBe(true);
  });
  it('conta esattamente i giorni del mese come inMonth (feb 2024 bisestile = 29)', () => {
    const grid = buildMonthGrid(2024, 2);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
  });
});
