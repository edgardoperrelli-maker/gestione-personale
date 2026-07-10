import { describe, it, expect } from 'vitest';
import { saracinescaProdotta } from './saracinescaProdotta';

describe('saracinescaProdotta', () => {
  it('non saracinesca -> false a prescindere dal resto', () => {
    expect(saracinescaProdotta('NO', 'eseguito', true)).toBe(false);
    expect(saracinescaProdotta(null, 'eseguito', true)).toBe(false);
  });
  it('ZAGAROLO: esito=eseguito -> true', () => {
    expect(saracinescaProdotta('SI', 'eseguito', null)).toBe(true);
    expect(saracinescaProdotta('SI', 'ESEGUITO', null)).toBe(true); // case-insensitive
  });
  it('ZAGAROLO: esito diverso da eseguito -> false, ANCHE se il DB è positivo (nessun fallback)', () => {
    expect(saracinescaProdotta('SI', 'no', true)).toBe(false);
  });
  it('DUNNING (esito assente dal master): usa il DB', () => {
    expect(saracinescaProdotta('SI', '', true)).toBe(true);
    expect(saracinescaProdotta('SI', null, true)).toBe(true);
  });
  it('DUNNING: DB negativo o assente -> false', () => {
    expect(saracinescaProdotta('SI', '', false)).toBe(false);
    expect(saracinescaProdotta('SI', '', null)).toBe(false);
    expect(saracinescaProdotta('SI', '', undefined)).toBe(false);
  });
});
