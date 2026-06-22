// lib/agente/statoOdl.test.ts
import { describe, it, expect } from 'vitest';
import { isNonAssegnabile, matchStato } from './statoOdl';

describe('isNonAssegnabile', () => {
  it('esclude completo / da richiedere (accenti/maiuscole/spazi)', () => {
    expect(isNonAssegnabile('Completo')).toBe(true);
    expect(isNonAssegnabile('  DA RICHIEDERE ')).toBe(true);
  });
  it('assegna gli stati aperti e ignora la cella vuota', () => {
    expect(isNonAssegnabile('')).toBe(false);
    expect(isNonAssegnabile('assegnato')).toBe(false);
    expect(isNonAssegnabile('ricevuto')).toBe(false);
  });
});

describe('matchStato', () => {
  it('lista custom', () => {
    expect(matchStato('Annullato', ['annullato'])).toBe(true);
    expect(matchStato('assegnato', ['annullato'])).toBe(false);
  });
});
