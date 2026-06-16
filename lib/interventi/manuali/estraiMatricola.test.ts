import { describe, it, expect } from 'vitest';
import { estraiMatricola } from './estraiMatricola';

describe('estraiMatricola', () => {
  it('estrae la matricola dall anagrafica', () => {
    expect(estraiMatricola({ anagrafica: { matricola: '202015249769' } })).toBe('202015249769');
  });
  it('normalizza spazi a inizio/fine', () => {
    expect(estraiMatricola({ anagrafica: { matricola: '  202015249769 ' } })).toBe('202015249769');
  });
  it('accetta valori numerici convertendoli a stringa', () => {
    expect(estraiMatricola({ anagrafica: { matricola: 202015249769 } as unknown as Record<string, string> })).toBe('202015249769');
  });
  it('stringa vuota se manca la matricola o l anagrafica', () => {
    expect(estraiMatricola({ anagrafica: {} })).toBe('');
    expect(estraiMatricola({ anagrafica: undefined as unknown as Record<string, string> })).toBe('');
    expect(estraiMatricola(null)).toBe('');
    expect(estraiMatricola(undefined)).toBe('');
  });
});
