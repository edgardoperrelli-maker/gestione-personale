import { describe, it, expect } from 'vitest';
import { territorioRiepilogo, TERRITORIO_MACRO_AI } from './territorioRiepilogo';

describe('territorioRiepilogo', () => {
  it('piano AI → macro ACEA, anche se il piano ha il comune come territorio', () => {
    expect(territorioRiepilogo({ aiCreato: true, pianoTerritorio: 'ZAGAROLO' })).toBe('ACEA');
    expect(territorioRiepilogo({ aiCreato: true, pianoTerritorio: 'ROMA' })).toBe('ACEA');
  });

  it('piano AI senza territorio → comunque ACEA', () => {
    expect(territorioRiepilogo({ aiCreato: true, pianoTerritorio: null })).toBe(TERRITORIO_MACRO_AI);
  });

  it('piano NON AI → conserva il territorio del piano (macro manuale)', () => {
    expect(territorioRiepilogo({ aiCreato: false, pianoTerritorio: 'FIRENZE' })).toBe('FIRENZE');
    expect(territorioRiepilogo({ aiCreato: false, pianoTerritorio: 'LAZIO CENTRO' })).toBe('LAZIO CENTRO');
  });

  it('piano NON AI senza territorio → null', () => {
    expect(territorioRiepilogo({ aiCreato: false, pianoTerritorio: null })).toBeNull();
  });
});
