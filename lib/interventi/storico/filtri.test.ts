// lib/interventi/storico/filtri.test.ts
import { describe, it, expect } from 'vitest';
import { parseFiltriStorico, risolviFinestra, puliziaQ } from './filtri';

const OGGI = '2026-06-17';

describe('parseFiltriStorico', () => {
  it('default vuoto: q vuota, date nulle, page 0', () => {
    expect(parseFiltriStorico(new URLSearchParams())).toEqual({
      q: '', data: null, dal: null, al: null, esecutore: null, comune: '', page: 0,
    });
  });
  it('q trimmata; range/valori; valori invalidi → null', () => {
    const f = parseFiltriStorico(new URLSearchParams({
      q: '  200123  ', dal: '2026-06-01', al: 'xx', esecutore: ' s1 ', comune: ' Roma ', page: '3',
    }));
    expect(f.q).toBe('200123');
    expect(f.dal).toBe('2026-06-01');
    expect(f.al).toBeNull();
    expect(f.esecutore).toBe('s1');
    expect(f.comune).toBe('Roma');
    expect(f.page).toBe(3);
  });
  it('page negativa/NaN → 0', () => {
    expect(parseFiltriStorico(new URLSearchParams({ page: '-2' })).page).toBe(0);
    expect(parseFiltriStorico(new URLSearchParams({ page: 'x' })).page).toBe(0);
  });
});

describe('risolviFinestra', () => {
  it('q presente → nessun vincolo data (tutto lo storico)', () => {
    const f = parseFiltriStorico(new URLSearchParams({ q: 'abc', dal: '2026-06-01' }));
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: null, gte: null, lte: null });
  });
  it('senza q e senza date → giorno corrente', () => {
    expect(risolviFinestra(parseFiltriStorico(new URLSearchParams()), OGGI)).toEqual({ eq: OGGI, gte: null, lte: null });
  });
  it('range date → gte/lte', () => {
    const f = parseFiltriStorico(new URLSearchParams({ dal: '2026-06-01', al: '2026-06-10' }));
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: null, gte: '2026-06-01', lte: '2026-06-10' });
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
