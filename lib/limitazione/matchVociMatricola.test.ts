import { describe, it, expect } from 'vitest';
import { matchVociMatricola, matchVociOdl } from './matchVociMatricola';

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

  // L'ODL NON entra da questa porta: la usa anche la ricerca ACEA, che cerca solo per matricola.
  it('NON aggancia sull ODL: quel verso è di matchVociOdl', () => {
    expect(matchVociMatricola([{ id: 'v9', odl: '12386221' }], '12386221')).toBeNull();
  });
});

describe('matchVociOdl', () => {
  const voci = [
    { id: 'v1', matricola: '309532', odl: '12386221' },
    { id: 'v2', matricola: '140622', odl: '12379532' },
    { id: 'v3', matricola: 'A1' }, // senza odl
  ];

  it('aggancia la voce già in rapportino per numero d ordine', () => {
    expect(matchVociOdl(voci, '12386221')?.id).toBe('v1');
  });

  it('normalizza come le matricole (spazi e separatori non contano)', () => {
    expect(matchVociOdl(voci, ' 12379-532 ')?.id).toBe('v2');
  });

  it('nessun match → null; ignora voci senza odl; q vuota → null', () => {
    expect(matchVociOdl(voci, '99999999')).toBeNull();
    expect(matchVociOdl(voci, '')).toBeNull();
  });
});
