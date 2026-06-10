import { describe, it, expect } from 'vitest';
import { comeArrayFoto } from './comeArrayFoto';

describe('comeArrayFoto', () => {
  it('stringa non vuota → lista di 1', () => {
    expect(comeArrayFoto('a/b.jpg')).toEqual(['a/b.jpg']);
  });
  it('array → filtra vuoti e non-stringhe', () => {
    expect(comeArrayFoto(['a.jpg', '', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg']);
    expect(comeArrayFoto(['a.jpg', null, 2, 'b.jpg'] as never)).toEqual(['a.jpg', 'b.jpg']);
  });
  it('vuoto/null/undefined → lista vuota', () => {
    expect(comeArrayFoto(null)).toEqual([]);
    expect(comeArrayFoto(undefined)).toEqual([]);
    expect(comeArrayFoto('')).toEqual([]);
    expect(comeArrayFoto('   ')).toEqual([]);
    expect(comeArrayFoto([])).toEqual([]);
  });
});
