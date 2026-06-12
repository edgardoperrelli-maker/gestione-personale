import { describe, it, expect } from 'vitest';
import { matchVociMatricola } from './matchVociMatricola';

describe('matchVociMatricola', () => {
  const voci = [
    { id: 'v1', matricola: 'A-023 041' },
    { id: 'v2', matricola: '99B000000' },
    { id: 'v3' }, // senza matricola
  ];

  it('match esatto normalizzato (maiuscole/spazi/trattini)', () => {
    expect(matchVociMatricola(voci, 'a023041')?.id).toBe('v1');
  });

  it('il prefisso variabile NON è match esatto (va ai suggerimenti)', () => {
    expect(matchVociMatricola(voci, '99A023041')).toBeNull();
  });

  it('nessun match → null; ignora voci senza matricola; q vuota → null', () => {
    expect(matchVociMatricola(voci, 'ZZZ999')).toBeNull();
    expect(matchVociMatricola(voci, '')).toBeNull();
  });
});
