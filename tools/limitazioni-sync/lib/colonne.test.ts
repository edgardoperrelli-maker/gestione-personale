// tools/limitazioni-sync/lib/colonne.test.ts
import { describe, it, expect } from 'vitest';
import { rilevaColonne, isFileMaster, colonnaMarker, normNome, risolviColonna } from './colonne.mjs';

// Intestazione ACEA reale (indici 0-based): F=5 ORDINE, I=8 MATRICOLA, BF=57 INDIRIZZO,
// BL=63 Locality, BM=64 Esecutore, BN=65 data prevista, BO=66 esito, BQ=68 sigillo posato,
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
  it('true se ha SOLO odl+matricola (ORDINE+MATRICOLA)', () => {
    expect(isFileMaster(headerAcea())).toBe(true);
  });
  it('true anche senza esito/sigillo (ora mappabili)', () => {
    expect(isFileMaster(['ORDINE', 'MATRICOLA'])).toBe(true);
  });
  it('false se manca matricola', () => {
    expect(isFileMaster(['ORDINE', 'INDIRIZZO'])).toBe(false);
  });
  it('false su un file estraneo', () => {
    expect(isFileMaster(['Data', 'Operatore', 'Note'])).toBe(false);
  });
});

describe('normNome', () => {
  it('uniforma maiuscole, accenti (NFD), NBSP e doppi spazi', () => {
    expect(normNome('Località')).toBe(normNome('LOCALITA'));
    expect(normNome("data prevista")).toBe("data prevista"); // NBSP -> spazio
    expect(normNome('  Sigillo   Posato  ')).toBe('sigillo posato'); // collapse + trim
  });
  it('null/undefined → stringa vuota', () => {
    expect(normNome(null)).toBe('');
    expect(normNome(undefined)).toBe('');
  });
});

describe('risolviColonna', () => {
  const headers = ['ORDINE', 'MATRICOLA', 'Località', 'Esecutore', 'esito'];
  it('trova per normNome (case/accento-insensitive) → index0', () => {
    expect(risolviColonna(headers, 'esecutore')).toBe(3);
    expect(risolviColonna(headers, 'LOCALITÀ')).toBe(2);
  });
  it('nome assente → -1', () => {
    expect(risolviColonna(headers, 'sigillo posato')).toBe(-1);
  });
  it('intestazioni duplicate → vince la prima', () => {
    expect(risolviColonna(['esito', 'X', 'esito'], 'esito')).toBe(0);
  });
});

describe('colonnaMarker', () => {
  it('prima colonna vuota dopo le note (BS=70)', () => {
    expect(colonnaMarker(headerAcea())).toBe(70);
  });
});
