import { describe, it, expect } from 'vitest';
import { puoiPrendere } from './presaInCarico';

describe('puoiPrendere', () => {
  it('libera (preso_da null) → sì', () => {
    expect(puoiPrendere(null, 'u1', false)).toBe(true);
  });
  it('già presa dallo stesso utente → sì (idempotente)', () => {
    expect(puoiPrendere('u1', 'u1', false)).toBe(true);
  });
  it('presa da altro senza override → no', () => {
    expect(puoiPrendere('u2', 'u1', false)).toBe(false);
  });
  it('presa da altro con override → sì', () => {
    expect(puoiPrendere('u2', 'u1', true)).toBe(true);
  });
  it('override su richiesta libera → sì', () => {
    expect(puoiPrendere(null, 'u1', true)).toBe(true);
  });
});
