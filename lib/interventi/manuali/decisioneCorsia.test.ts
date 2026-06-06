import { describe, it, expect } from 'vitest';
import { decisioneCorsia } from './decisioneCorsia';

describe('decisioneCorsia', () => {
  it('manuali_liberi true → liberi', () => {
    expect(decisioneCorsia({ manuali_liberi: true })).toBe('liberi');
  });
  it('manuali_liberi false → normale', () => {
    expect(decisioneCorsia({ manuali_liberi: false })).toBe('normale');
  });
  it('riga senza il campo → normale', () => {
    expect(decisioneCorsia({})).toBe('normale');
  });
  it('campo null/undefined → normale', () => {
    expect(decisioneCorsia({ manuali_liberi: null })).toBe('normale');
    expect(decisioneCorsia({ manuali_liberi: undefined })).toBe('normale');
  });
  it('riga assente (null) → normale', () => {
    expect(decisioneCorsia(null)).toBe('normale');
  });
  it('riga assente (undefined) → normale', () => {
    expect(decisioneCorsia(undefined)).toBe('normale');
  });
});
