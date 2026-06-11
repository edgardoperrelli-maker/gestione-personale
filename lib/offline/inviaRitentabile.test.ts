import { describe, it, expect } from 'vitest';
import { inviaRitentabile } from './inviaRitentabile';

describe('inviaRitentabile', () => {
  it('409 voci_in_sospeso → ritentabile', () => {
    expect(inviaRitentabile(409, { error: 'voci_in_sospeso', inSospeso: 2 })).toBe(true);
  });
  it('409 di altro tipo → NON ritentabile (terminale)', () => {
    expect(inviaRitentabile(409, { error: 'non_modificabile' })).toBe(false);
    expect(inviaRitentabile(409, {})).toBe(false);
    expect(inviaRitentabile(409, null)).toBe(false);
  });
  it('status non-409 → NON ritentabile', () => {
    expect(inviaRitentabile(200, { error: 'voci_in_sospeso' })).toBe(false);
    expect(inviaRitentabile(403, { error: 'voci_in_sospeso' })).toBe(false);
  });
});
