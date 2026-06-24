import { describe, it, expect } from 'vitest';
import { pathFotoTentativo, isViolazionePk } from './fotoStorageHardening';

describe('pathFotoTentativo', () => {
  it('include richiestaId, slot, identificativo, tentativo ed estensione', () => {
    expect(pathFotoTentativo('req1', 'sigillatura', '912231812', 'ab12cd34', 'jpg'))
      .toBe('req1/sigillatura_912231812_ab12cd34.jpg');
  });
  it('tentativi diversi → path diversi (no collisione tra POST concorrenti)', () => {
    const a = pathFotoTentativo('req1', 'foto', 'X', 'aaaaaaaa', 'jpg');
    const b = pathFotoTentativo('req1', 'foto', 'X', 'bbbbbbbb', 'jpg');
    expect(a).not.toBe(b);
  });
});

describe('isViolazionePk', () => {
  it('codice 23505 → true', () => { expect(isViolazionePk({ code: '23505' })).toBe(true); });
  it('altri codici → false', () => { expect(isViolazionePk({ code: '23503' })).toBe(false); });
  it('null/undefined → false', () => { expect(isViolazionePk(null)).toBe(false); expect(isViolazionePk(undefined)).toBe(false); });
});
