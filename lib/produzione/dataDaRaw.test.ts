import { describe, it, expect } from 'vitest';
import { dataDaRaw } from './dataDaRaw';

describe('dataDaRaw', () => {
  it('formato ISO', () => {
    expect(dataDaRaw('2026-06-19 00:00:00')).toBe('2026-06-19');
    expect(dataDaRaw('2026-06-19')).toBe('2026-06-19');
  });
  it('formato DD/MM/YYYY', () => {
    expect(dataDaRaw('19/06/2026')).toBe('2026-06-19');
  });
  it('formato Date JS/Excel (data prevista delle righe manuali)', () => {
    expect(dataDaRaw('Fri Jun 19 2026 02:00:00 GMT+0200 (Ora legale dell’Europa centrale)')).toBe('2026-06-19');
    expect(dataDaRaw('Wed Jun 24 2026 02:00:00 GMT+0200')).toBe('2026-06-24');
  });
  it('vuoto/null → null', () => {
    expect(dataDaRaw('')).toBeNull();
    expect(dataDaRaw(null)).toBeNull();
    expect(dataDaRaw('   ')).toBeNull();
  });
  it('non parsabile → null', () => {
    expect(dataDaRaw('pippo')).toBeNull();
  });
});
