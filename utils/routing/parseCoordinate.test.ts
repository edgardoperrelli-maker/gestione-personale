import { describe, it, expect } from 'vitest';
import { parseLatLng } from './parseCoordinate';

describe('parseLatLng', () => {
  it('due colonne numeriche → "lat, lng" col punto (pulisce il rumore float)', () => {
    expect(parseLatLng(41.853674999999996, 12.7888783)).toBe('41.853675, 12.7888783');
  });
  it('virgola decimale all\'italiana → punto', () => {
    expect(parseLatLng('41,853674', '12,788878')).toBe('41.853674, 12.788878');
  });
  it('stringhe già col punto → invariate', () => {
    expect(parseLatLng('41.853674', '12.788878')).toBe('41.853674, 12.788878');
  });
  it('longitudine negativa valida', () => {
    expect(parseLatLng(45, -120)).toBe('45, -120');
  });
  it('0,0 → null', () => { expect(parseLatLng(0, 0)).toBeNull(); });
  it('cella vuota → null', () => { expect(parseLatLng('', '12.7')).toBeNull(); });
  it('testo non numerico → null', () => { expect(parseLatLng('N/A', 'x')).toBeNull(); });
  it('lat fuori range → null', () => { expect(parseLatLng(91, 12)).toBeNull(); });
  it('lng fuori range → null', () => { expect(parseLatLng(41, 181)).toBeNull(); });
});
