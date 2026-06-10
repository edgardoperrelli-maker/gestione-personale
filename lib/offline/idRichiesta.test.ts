import { describe, it, expect } from 'vitest';
import { richiestaIdValido } from './idRichiesta';

describe('richiestaIdValido', () => {
  it('accetta un UUID v4 ben formato', () => {
    expect(richiestaIdValido('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
  });
  it('rifiuta stringhe non-UUID', () => {
    expect(richiestaIdValido('abc')).toBe(false);
    expect(richiestaIdValido('')).toBe(false);
    expect(richiestaIdValido(undefined)).toBe(false);
    expect(richiestaIdValido('3f2504e0-4f89-41d3-9a0c')).toBe(false);
  });
});
