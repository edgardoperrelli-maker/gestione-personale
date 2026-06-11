import { describe, it, expect } from 'vitest';
import { notaUfficioFromRaw } from './notaUfficio';

describe('notaUfficioFromRaw', () => {
  it('estrae la nota stringa dal raw_json', () => {
    expect(notaUfficioFromRaw({ note: 'Citofonare Rossi' })).toBe('Citofonare Rossi');
  });
  it('assente o raw null → undefined', () => {
    expect(notaUfficioFromRaw({})).toBeUndefined();
    expect(notaUfficioFromRaw(null)).toBeUndefined();
  });
  it('stringa vuota o solo spazi → undefined', () => {
    expect(notaUfficioFromRaw({ note: '' })).toBeUndefined();
    expect(notaUfficioFromRaw({ note: '   ' })).toBeUndefined();
  });
  it('tipo non stringa → undefined', () => {
    expect(notaUfficioFromRaw({ note: 123 })).toBeUndefined();
  });
});
