import { describe, it, expect } from 'vitest';
import { dimensioniTarget, LATO_LUNGO_MAX, JPEG_QUALITA, MAX_FOTO_BYTES, TENTATIVI_COMPRESSIONE } from './compressioneFoto';

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

describe('scaletta di compressione (anti-troncamento upload)', () => {
  it('MAX_FOTO_BYTES è una soglia positiva e "leggera" (≤ ~1 MB)', () => {
    expect(MAX_FOTO_BYTES).toBeGreaterThan(0);
    expect(MAX_FOTO_BYTES).toBeLessThanOrEqual(1_000_000);
  });

  it('il primo tentativo è il caso storico (1600 @ 0.8): foto leggera = identica a prima', () => {
    expect(TENTATIVI_COMPRESSIONE[0]).toEqual({ lato: LATO_LUNGO_MAX, qualita: JPEG_QUALITA });
  });

  it('i tentativi successivi non aumentano mai peso (lato e qualità non crescono)', () => {
    expect(TENTATIVI_COMPRESSIONE.length).toBeGreaterThan(1);
    for (let i = 1; i < TENTATIVI_COMPRESSIONE.length; i++) {
      const prec = TENTATIVI_COMPRESSIONE[i - 1];
      const cur = TENTATIVI_COMPRESSIONE[i];
      expect(cur.lato).toBeLessThanOrEqual(prec.lato);
      expect(cur.qualita).toBeLessThanOrEqual(prec.qualita);
      expect(cur.qualita).toBeGreaterThan(0);
      expect(cur.lato).toBeGreaterThan(0);
    }
  });

  it('scende sotto la piena risoluzione per garantire un payload piccolo su rete debole', () => {
    const ultimo = TENTATIVI_COMPRESSIONE[TENTATIVI_COMPRESSIONE.length - 1];
    expect(ultimo.lato).toBeLessThan(LATO_LUNGO_MAX);
  });
});
