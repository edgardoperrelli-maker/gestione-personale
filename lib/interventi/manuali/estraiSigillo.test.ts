import { describe, it, expect } from 'vitest';
import { estraiSigillo, normSigillo, sigilloDuplicato } from './estraiSigillo';

describe('estraiSigillo', () => {
  it('prende il sigillo dalle risposte e lo trimma', () => {
    expect(estraiSigillo({ risposte: { sigillo: '  AA728566 ' } })).toBe('AA728566');
  });
  it('vuoto se assente o nullo', () => {
    expect(estraiSigillo({ risposte: {} })).toBe('');
    expect(estraiSigillo({ risposte: { sigillo: null } })).toBe('');
    expect(estraiSigillo(null)).toBe('');
  });
  it('numerico → stringa', () => {
    expect(estraiSigillo({ risposte: { sigillo: 728566 } })).toBe('728566');
  });
});

describe('normSigillo', () => {
  it('trim + maiuscolo', () => {
    expect(normSigillo(' aa728566 ')).toBe('AA728566');
    expect(normSigillo(null)).toBe('');
  });
});

describe('sigilloDuplicato', () => {
  it('case-insensitive e trim-insensitive', () => {
    expect(sigilloDuplicato('AA728566', ['bb1', ' aa728566 '])).toBe(true);
    expect(sigilloDuplicato('AA728566', ['BB1', 'CC2'])).toBe(false);
  });
  it('sigillo vuoto non è mai duplicato', () => {
    expect(sigilloDuplicato('', ['', '  '])).toBe(false);
    expect(sigilloDuplicato('   ', ['x'])).toBe(false);
  });
});
