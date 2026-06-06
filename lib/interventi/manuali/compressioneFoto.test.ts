import { describe, it, expect } from 'vitest';
import { dimensioniTarget, LATO_LUNGO_MAX } from './compressioneFoto';

describe('dimensioniTarget', () => {
  it('riduce in orizzontale mantenendo le proporzioni', () => {
    expect(dimensioniTarget(3200, 2400)).toEqual({ width: 1600, height: 1200 });
  });

  it('riduce in verticale (lato lungo = altezza)', () => {
    expect(dimensioniTarget(2400, 3200)).toEqual({ width: 1200, height: 1600 });
  });

  it('non ingrandisce immagini più piccole del massimo', () => {
    expect(dimensioniTarget(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('immagine quadrata al limite resta invariata', () => {
    expect(dimensioniTarget(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("arrotonda all'intero", () => {
    const d = dimensioniTarget(2000, 1333); // scala = 1600/2000 = 0.8 → 1066.4
    expect(d).toEqual({ width: 1600, height: 1066 });
  });

  it('LATO_LUNGO_MAX è 1600', () => {
    expect(LATO_LUNGO_MAX).toBe(1600);
  });
});
