import { describe, it, expect } from 'vitest';
import { normMatricola, matricoleSimili } from './matricoleSimili';

describe('normMatricola', () => {
  it('maiuscolo e rimuove spazi/trattini/non-alfanumerici', () => {
    expect(normMatricola(' a-023 041 ')).toBe('A023041');
  });
});

describe('matricoleSimili', () => {
  const db = (...m: string[]) => m.map((matricola) => ({ matricola }));

  it('prefisso variabile: A023041 suggerisce 99A023041', () => {
    const r = matricoleSimili('A023041', db('99A023041', 'B999999'));
    expect(r.map((x) => x.matricola)).toEqual(['99A023041']);
  });

  it('caso inverso: 99A023041 suggerisce A023041', () => {
    const r = matricoleSimili('99A023041', db('A023041'));
    expect(r.map((x) => x.matricola)).toEqual(['A023041']);
  });

  it('ordina esatto > suffisso > prefisso > contenimento', () => {
    const r = matricoleSimili('A023041', db('XA023041Y', '99A023041', 'A023041', 'A023041Z'));
    expect(r.map((x) => x.matricola)).toEqual(['A023041', '99A023041', 'A023041Z', 'XA023041Y']);
  });

  it('query troppo corta (<4) → nessun suggerimento', () => {
    expect(matricoleSimili('A02', db('99A023041'))).toEqual([]);
  });

  it('taglia a max (default 8)', () => {
    const many = db(...Array.from({ length: 20 }, (_, i) => `A023041_${i}`));
    expect(matricoleSimili('A023041', many)).toHaveLength(8);
  });
});
