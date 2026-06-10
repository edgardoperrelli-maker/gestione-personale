import { describe, it, expect } from 'vitest';
import { normalizzaIndirizzo, stessoCivico } from './matchIndirizzo';

describe('normalizzaIndirizzo', () => {
  it('lowercase, no accenti/punteggiatura/spazi', () => {
    expect(normalizzaIndirizzo("Via G. D'Annunzio, 12")).toBe('viagdannunzio12');
    expect(normalizzaIndirizzo('  VIA Róma  ')).toBe('viaroma');
    expect(normalizzaIndirizzo(null)).toBe('');
  });
});

describe('stessoCivico', () => {
  it('uguali dopo normalizzazione', () => {
    expect(stessoCivico('Via Roma 12', 'via roma 12')).toBe(true);
  });
  it("uno contiene l'altro (tollera civico mancante)", () => {
    expect(stessoCivico('Via Roma', 'Via Roma 12')).toBe(true);
    expect(stessoCivico('Via Roma 12', 'Via Roma')).toBe(true);
  });
  it('vie diverse → false', () => {
    expect(stessoCivico('Via Roma 12', 'Via Milano 3')).toBe(false);
  });
  it('vuoti → false', () => {
    expect(stessoCivico('', 'Via Roma')).toBe(false);
    expect(stessoCivico('Via Roma', '')).toBe(false);
  });
});
