import { describe, it, expect } from 'vitest';
import { validaTassonomiaInput } from './validaTassonomiaInput';

describe('validaTassonomiaInput', () => {
  it('input valido: descrizione trim/spazi collassati (case CONSERVATO), gruppo uppercase', () => {
    const r = validaTassonomiaInput({ committente: 'acea', descrizione: '  Limitazione  Massiva su Impianto ', gruppo: ' limitazioni massive ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valore.descrizione).toBe('Limitazione Massiva su Impianto');
      expect(r.valore.gruppo).toBe('LIMITAZIONI MASSIVE');
      expect(r.valore.committente).toBe('acea');
    }
  });
  it('committente normalizzato lowercase e validato', () => {
    const r = validaTassonomiaInput({ committente: 'ITALGAS', descrizione: 'BONIFICHE', gruppo: 'BONIFICHE' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valore.committente).toBe('italgas');
  });
  it('committente fuori lista → errore', () => {
    const r = validaTassonomiaInput({ committente: 'lim_massive', descrizione: 'X', gruppo: 'G' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain('committente');
  });
  it('descrizione vuota → errore', () => {
    const r = validaTassonomiaInput({ committente: 'acea', descrizione: '   ', gruppo: 'G' });
    expect(r.ok).toBe(false);
  });
  it('gruppo vuoto → errore', () => {
    const r = validaTassonomiaInput({ committente: 'acea', descrizione: 'X', gruppo: '' });
    expect(r.ok).toBe(false);
  });
  it('body non-oggetto → errore', () => {
    expect(validaTassonomiaInput(null).ok).toBe(false);
    expect(validaTassonomiaInput('x').ok).toBe(false);
  });
});
