// tools/limitazioni-sync/lib/statiOdl.test.ts
import { describe, it, expect } from 'vitest';
import { isChiuso, matchStato } from './statiOdl.mjs';

describe('isChiuso', () => {
  it('riconosce gli stati chiusi di default (accenti/maiuscole/spazi)', () => {
    expect(isChiuso('Completato')).toBe(true);
    expect(isChiuso('  ANNULLATO ')).toBe(true);
    expect(isChiuso('completato il 22/06')).toBe(true);
  });
  it('non chiude gli stati aperti né la cella vuota', () => {
    expect(isChiuso('')).toBe(false);
    expect(isChiuso('da richiedere')).toBe(false);
    expect(isChiuso('completo')).toBe(false); // "completo" != "completato"
  });
});

describe('matchStato', () => {
  it('lista custom', () => {
    expect(matchStato('Completo', ['completo', 'da richiedere'])).toBe(true);
    expect(matchStato('assegnato', ['completo', 'da richiedere'])).toBe(false);
  });
});
