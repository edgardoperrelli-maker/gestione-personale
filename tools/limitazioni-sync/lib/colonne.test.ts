// tools/limitazioni-sync/lib/colonne.test.ts
import { describe, it, expect } from 'vitest';
import { rilevaColonne, isFileMaster, colonnaMarker } from './colonne.mjs';

// Intestazione ACEA reale (indici 0-based): F=5 ORDINE, I=8 MATRICOLA, BF=57 INDIRIZZO,
// BL=63 Località, BM=64 Esecutore, BN=65 data prevista, BO=66 esito, BQ=68 sigillo posato,
// BR=69 stato odl, BS=70 vuota.
function headerAcea(): string[] {
  const h: string[] = [];
  h[5] = 'ORDINE'; h[8] = 'MATRICOLA'; h[57] = 'INDIRIZZO'; h[63] = 'Località';
  h[64] = 'Esecutore'; h[65] = 'data prevista'; h[66] = 'esito';
  h[68] = 'sigillo posato'; h[69] = 'stato odl';
  return h;
}

describe('rilevaColonne', () => {
  it('mappa le colonne note per intestazione', () => {
    const c = rilevaColonne(headerAcea());
    expect(c).toMatchObject({
      odl: 5, matricola: 8, via: 57, comune: 63, esecutore: 64, data: 65, esito: 66, sigillo: 68,
    });
  });
});

describe('isFileMaster', () => {
  it('true se ha la firma minima (odl, matricola, esito, sigillo)', () => {
    expect(isFileMaster(headerAcea())).toBe(true);
  });
  it('false su un file estraneo', () => {
    expect(isFileMaster(['Data', 'Operatore', 'Note'])).toBe(false);
  });
});

describe('colonnaMarker', () => {
  it('prima colonna vuota dopo le note (BS=70)', () => {
    expect(colonnaMarker(headerAcea())).toBe(70);
  });
});
