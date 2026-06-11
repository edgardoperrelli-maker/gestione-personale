import { describe, it, expect } from 'vitest';
import { placeholderFoto, isPlaceholderFoto, blobIdDaPlaceholder } from './fotoPlaceholder';

describe('fotoPlaceholder', () => {
  it('placeholderFoto produce blob-locale:<id>', () => {
    expect(placeholderFoto('abc')).toBe('blob-locale:abc');
  });
  it('isPlaceholderFoto riconosce i placeholder', () => {
    expect(isPlaceholderFoto('blob-locale:abc')).toBe(true);
    expect(isPlaceholderFoto('rapportini/rap1/foto.jpg')).toBe(false);
    expect(isPlaceholderFoto(123)).toBe(false);
    expect(isPlaceholderFoto(undefined)).toBe(false);
    expect(isPlaceholderFoto('')).toBe(false);
  });
  it('blobIdDaPlaceholder estrae l\'id (o null)', () => {
    expect(blobIdDaPlaceholder('blob-locale:abc')).toBe('abc');
    expect(blobIdDaPlaceholder('rapportini/x.jpg')).toBeNull();
    expect(blobIdDaPlaceholder(undefined)).toBeNull();
  });
});
