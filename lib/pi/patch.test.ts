import { describe, it, expect } from 'vitest';
import { matricolaPatchMancante, PATCH_KEY, PATCH_MATRICOLA_KEY } from './patch';

describe('matricolaPatchMancante', () => {
  it('PATCH non spuntata → mai mancante (anche senza matricola)', () => {
    expect(matricolaPatchMancante(null)).toBe(false);
    expect(matricolaPatchMancante({})).toBe(false);
    expect(matricolaPatchMancante({ [PATCH_KEY]: false })).toBe(false);
    expect(matricolaPatchMancante({ [PATCH_KEY]: false, [PATCH_MATRICOLA_KEY]: '' })).toBe(false);
  });

  it('PATCH spuntata + matricola vuota/spazi → mancante', () => {
    expect(matricolaPatchMancante({ [PATCH_KEY]: true })).toBe(true);
    expect(matricolaPatchMancante({ [PATCH_KEY]: true, [PATCH_MATRICOLA_KEY]: '' })).toBe(true);
    expect(matricolaPatchMancante({ [PATCH_KEY]: true, [PATCH_MATRICOLA_KEY]: '   ' })).toBe(true);
  });

  it('PATCH spuntata + matricola valorizzata → ok', () => {
    expect(matricolaPatchMancante({ [PATCH_KEY]: true, [PATCH_MATRICOLA_KEY]: 'AB123' })).toBe(false);
  });

  it('solo il boolean true attiva l’obbligo (stringa "true" non conta)', () => {
    expect(matricolaPatchMancante({ [PATCH_KEY]: 'true' })).toBe(false);
  });
});
