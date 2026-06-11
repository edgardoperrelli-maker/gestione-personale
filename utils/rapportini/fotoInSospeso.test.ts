import { describe, it, expect } from 'vitest';
import { contaFotoInSospeso } from './fotoInSospeso';

const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';
const PH2 = 'blob-locale:22222222-2222-2222-2222-222222222222';
const PATH = 'rapportini/r1/a.jpg';

describe('contaFotoInSospeso', () => {
  it('0 con null/undefined/oggetto vuoto', () => {
    expect(contaFotoInSospeso(null)).toBe(0);
    expect(contaFotoInSospeso(undefined)).toBe(0);
    expect(contaFotoInSospeso({})).toBe(0);
  });
  it('0 quando tutti i valori sono path reali o non-foto', () => {
    expect(contaFotoInSospeso({ a: PATH, eseguito: 'SI', note: 'x' })).toBe(0);
  });
  it('conta i segnaposto scalari', () => {
    expect(contaFotoInSospeso({ a: PH, b: PATH, c: PH2 })).toBe(2);
  });
  it('conta i segnaposto dentro gli array', () => {
    expect(contaFotoInSospeso({ a: [PH, PATH, PH2] })).toBe(2);
  });
});
