// tools/limitazioni-sync/lib/match.test.ts
import { describe, it, expect } from 'vitest';
import { norm, buildIndice, agganciaRiga, trovaExtra } from './match.mjs';

const lavori = [
  { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', manuale: false },
  { id: 'b', odl: null, matricola: '202315612361', comune: 'ZAGAROLO', manuale: true },
  { id: 'c', odl: null, matricola: '999', comune: 'TIVOLI', manuale: true },
];

describe('norm', () => {
  it('maiuscolo senza spazi', () => {
    expect(norm(' 912 231 020 ')).toBe('912231020');
  });
});

describe('agganciaRiga', () => {
  const idx = buildIndice(lavori);
  it('aggancia per ODL', () => {
    expect(agganciaRiga({ odl: '912231020', matricola: 'x' }, idx, 'ZAGAROLO')).toEqual({
      lavoro: lavori[0], via: 'odl',
    });
  });
  it('fallback per matricola nello stesso comune', () => {
    expect(agganciaRiga({ odl: '', matricola: '202315612361' }, idx, 'ZAGAROLO')).toEqual({
      lavoro: lavori[1], via: 'matricola',
    });
  });
  it('NON aggancia matricola di comune diverso', () => {
    expect(agganciaRiga({ odl: '', matricola: '999' }, idx, 'ZAGAROLO')).toBeNull();
  });
});

describe('trovaExtra', () => {
  it('solo manuali non consumati', () => {
    const extra = trovaExtra(lavori, new Set(['b']));
    expect(extra.map((l) => l.id)).toEqual(['c']);
  });
});
