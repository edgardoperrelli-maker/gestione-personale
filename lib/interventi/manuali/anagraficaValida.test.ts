import { describe, it, expect } from 'vitest';
import { anagraficaValida } from './anagraficaValida';

describe('anagraficaValida', () => {
  it('valida: ha identificativo (pdr) e indirizzo (via + comune)', () => {
    expect(anagraficaValida({ pdr: 'PDR1', via: 'Via Roma 1', comune: 'Roma' })).toBe(true);
  });

  it('valida: identificativo tramite odl, indirizzo tramite solo comune', () => {
    expect(anagraficaValida({ odl: 'ODL9', comune: 'Milano' })).toBe(true);
  });

  it('valida: identificativo tramite matricola, indirizzo tramite solo via', () => {
    expect(anagraficaValida({ matricola: 'M001', via: 'Corso Garibaldi 5' })).toBe(true);
  });

  it('non valida: manca identificativo (pdr/odl/matricola tutti vuoti)', () => {
    expect(anagraficaValida({ via: 'Via Roma 1', comune: 'Roma' })).toBe(false);
  });

  it('non valida: manca indirizzo (via e comune entrambi assenti)', () => {
    expect(anagraficaValida({ pdr: 'PDR1' })).toBe(false);
  });

  it('non valida: anagrafica completamente vuota', () => {
    expect(anagraficaValida({})).toBe(false);
  });

  it('non valida: campi presenti ma tutti stringhe vuote', () => {
    expect(anagraficaValida({ pdr: '', odl: '  ', matricola: '', via: '', comune: '  ' })).toBe(false);
  });

  it('lim_massive: identificativo + via bastano (comune/cap facoltativi)', () => {
    expect(anagraficaValida({ matricola: 'AA731024', via: 'Corso Garibaldi 131' }, 'lim_massive')).toBe(true);
  });

  it('lim_massive: senza via non valida (anche con matricola e comune)', () => {
    expect(anagraficaValida({ matricola: 'AA731024', comune: 'Zagarolo' }, 'lim_massive')).toBe(false);
  });

  it('lim_massive: senza identificativo resta non valida', () => {
    expect(anagraficaValida({ via: 'Corso Garibaldi 131' }, 'lim_massive')).toBe(false);
  });
});
