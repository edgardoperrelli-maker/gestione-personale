// tools/limitazioni-sync/lib/dataCella.test.ts
import { describe, it, expect } from 'vitest';
import { giornoDa, aDataExcel, decidiScritturaData } from './dataCella.mjs';

describe('giornoDa', () => {
  it('estrae YYYY-MM-DD da una stringa ISO', () => {
    expect(giornoDa('2026-06-03')).toBe('2026-06-03');
    expect(giornoDa('2026-06-03T10:00:00Z')).toBe('2026-06-03');
  });
  it('estrae YYYY-MM-DD da una Date a mezzogiorno locale (no fuso-shift)', () => {
    expect(giornoDa(new Date(2026, 5, 3, 12, 0, 0))).toBe('2026-06-03');
  });
  it('vuoto/null/invalido → stringa vuota', () => {
    expect(giornoDa('')).toBe('');
    expect(giornoDa(null)).toBe('');
    expect(giornoDa('non-una-data')).toBe('');
  });
  it('un numero grezzo (seriale Excel) → stringa vuota, non un anno assurdo', () => {
    expect(giornoDa(46185)).toBe('');
  });
});

describe('aDataExcel', () => {
  it('iso → Date a mezzogiorno locale', () => {
    const d = aDataExcel('2026-06-03');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);   // giugno = 5
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(12);
  });
  it('round-trip: giornoDa(aDataExcel(iso)) === iso', () => {
    expect(giornoDa(aDataExcel('2026-06-16'))).toBe('2026-06-16');
    expect(giornoDa(aDataExcel('2025-01-01'))).toBe('2025-01-01');
  });
  it('iso vuoto/invalido → null', () => {
    expect(aDataExcel('')).toBeNull();
    expect(aDataExcel('non-una-data')).toBeNull();
  });
});

describe('decidiScritturaData', () => {
  it('cella vuota → scrivi una Date Excel', () => {
    const d = decidiScritturaData(null, '2026-06-03');
    expect(d.azione).toBe('scrivi');
    expect(d.valore).toBeInstanceOf(Date);
    expect(giornoDa(d.valore)).toBe('2026-06-03');
  });
  it('nuovo iso vuoto → salta', () => {
    expect(decidiScritturaData(new Date(2026, 5, 3, 12), '')).toEqual({ azione: 'salta', valore: null });
  });
  it('stesso giorno (Date Excel già presente) → salta (niente falso conflitto)', () => {
    const esistente = aDataExcel('2026-06-03');
    expect(decidiScritturaData(esistente, '2026-06-03')).toEqual({ azione: 'salta', valore: null });
  });
  it('stesso giorno (stringa già presente) → salta', () => {
    expect(decidiScritturaData('2026-06-03', '2026-06-03')).toEqual({ azione: 'salta', valore: null });
  });
  it('giorno diverso → conflitto (esistente per giorno)', () => {
    const d = decidiScritturaData(aDataExcel('2026-06-01'), '2026-06-03');
    expect(d.azione).toBe('conflitto');
    expect(d.esistente).toBe('2026-06-01');
    expect(giornoDa(d.valore)).toBe('2026-06-03');
  });
});
