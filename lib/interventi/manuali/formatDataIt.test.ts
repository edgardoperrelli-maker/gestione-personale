import { describe, it, expect } from 'vitest';
import { formatDataIt, formatDataOraIt } from './formatDataIt';

describe('formatDataIt', () => {
  it('formatta una data YYYY-MM-DD in GG/MM/AAAA', () => {
    expect(formatDataIt('2026-06-15')).toBe('15/06/2026');
    expect(formatDataIt('2026-01-02')).toBe('02/01/2026');
  });
  it('accetta anche un timestamp ISO usando solo la parte data', () => {
    expect(formatDataIt('2026-06-15T22:30:00Z')).toBe('15/06/2026');
  });
  it('stringa vuota se assente', () => {
    expect(formatDataIt(null)).toBe('');
    expect(formatDataIt(undefined)).toBe('');
    expect(formatDataIt('')).toBe('');
  });
  it('fallback al valore grezzo se non riconosciuto', () => {
    expect(formatDataIt('non-una-data')).toBe('non-una-data');
  });
});

describe('formatDataOraIt', () => {
  it('formatta un timestamp ISO in GG/MM/AAAA, HH:mm (ora di Roma)', () => {
    // 2026-06-15T10:30:00Z → estate (UTC+2) → 12:30 a Roma
    expect(formatDataOraIt('2026-06-15T10:30:00Z')).toBe('15/06/2026, 12:30');
  });
  it('stringa vuota se assente', () => {
    expect(formatDataOraIt(null)).toBe('');
    expect(formatDataOraIt(undefined)).toBe('');
    expect(formatDataOraIt('')).toBe('');
  });
  it('fallback al valore grezzo se non parsabile', () => {
    expect(formatDataOraIt('non-una-data')).toBe('non-una-data');
  });
});
