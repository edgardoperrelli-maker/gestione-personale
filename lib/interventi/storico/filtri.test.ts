// lib/interventi/storico/filtri.test.ts
import { describe, it, expect } from 'vitest';
import { parseFiltriStorico, risolviFinestra, puliziaQ, nessunFiltro } from './filtri';

describe('parseFiltriStorico', () => {
  it('default vuoto: tutti null/vuoti, page 0', () => {
    expect(parseFiltriStorico(new URLSearchParams())).toEqual({
      q: '', data: null, dal: null, al: null, esecutori: [], gruppi: [], committenti: [], comune: '',
      eseguito: null, sostValvola: null, miniBag: null, rgStop: null, page: 0,
    });
  });
  it('q trimmata; range/valori; valori invalidi → null', () => {
    const f = parseFiltriStorico(new URLSearchParams({
      q: '  200123  ', dal: '2026-06-01', al: 'xx', esecutore: ' s1 ', comune: ' Roma ', page: '3',
    }));
    expect(f.q).toBe('200123');
    expect(f.dal).toBe('2026-06-01');
    expect(f.al).toBeNull();
    expect(f.esecutori).toEqual(['s1']);
    expect(f.comune).toBe('Roma');
    expect(f.page).toBe(3);
  });
  it('filtri multi: parametro ripetuto, trim, senza vuoti né duplicati', () => {
    const f = parseFiltriStorico(new URLSearchParams([
      ['esecutore', 's1'], ['esecutore', ' s2 '], ['esecutore', 's1'], ['esecutore', '  '],
      ['gruppo', 'DUNNING'], ['gruppo', 'LIMITAZIONI MASSIVE'],
      ['committente', 'acea'], ['committente', 'italgas'],
    ]));
    expect(f.esecutori).toEqual(['s1', 's2']);
    expect(f.gruppi).toEqual(['DUNNING', 'LIMITAZIONI MASSIVE']);
    expect(f.committenti).toEqual(['acea', 'italgas']);
  });
  it('filtri SI/NO: solo SI o NO, altrimenti null', () => {
    const f = parseFiltriStorico(new URLSearchParams({ eseguito: 'SI', sostValvola: 'NO', miniBag: 'x', rgStop: 'SI' }));
    expect(f.eseguito).toBe('SI');
    expect(f.sostValvola).toBe('NO');
    expect(f.miniBag).toBeNull();
    expect(f.rgStop).toBe('SI');
  });
});

describe('risolviFinestra', () => {
  it('q presente → nessun vincolo data', () => {
    const f = parseFiltriStorico(new URLSearchParams({ q: 'abc', dal: '2026-06-01' }));
    expect(risolviFinestra(f)).toEqual({ eq: null, gte: null, lte: null });
  });
  it('nessun filtro → nessun vincolo data (intero DB)', () => {
    expect(risolviFinestra(parseFiltriStorico(new URLSearchParams()))).toEqual({ eq: null, gte: null, lte: null });
  });
  it('data singola → eq', () => {
    const f = parseFiltriStorico(new URLSearchParams({ data: '2026-06-17' }));
    expect(risolviFinestra(f)).toEqual({ eq: '2026-06-17', gte: null, lte: null });
  });
  it('range date → gte/lte', () => {
    const f = parseFiltriStorico(new URLSearchParams({ dal: '2026-06-01', al: '2026-06-10' }));
    expect(risolviFinestra(f)).toEqual({ eq: null, gte: '2026-06-01', lte: '2026-06-10' });
  });
});

describe('nessunFiltro', () => {
  it('true con parametri vuoti', () => {
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams()))).toBe(true);
  });
  it('false con un filtro qualsiasi', () => {
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams({ comune: 'Roma' })))).toBe(false);
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams({ eseguito: 'SI' })))).toBe(false);
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams({ q: 'x' })))).toBe(false);
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams({ esecutore: 's1' })))).toBe(false);
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams({ gruppo: 'DUNNING' })))).toBe(false);
    expect(nessunFiltro(parseFiltriStorico(new URLSearchParams({ committente: 'acea' })))).toBe(false);
  });
});

describe('puliziaQ', () => {
  it('trim e rimozione caratteri che rompono il filtro PostgREST', () => {
    expect(puliziaQ('  ab,c(%)*  ')).toBe('ab c');
  });
  it('stringa vuota resta vuota', () => {
    expect(puliziaQ('   ')).toBe('');
  });
});
