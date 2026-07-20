import { describe, expect, it } from 'vitest';
import { campiDiVoce, unioneCampi } from './campiDiVoce';
import type { TemplateCampo } from './buildVoci';

const c = (chiave: string, ordine: number): TemplateCampo => ({ chiave, etichetta: chiave.toUpperCase(), tipo: 'testo', ordine });

describe('campiDiVoce', () => {
  const fallback = [c('eseguito', 1)];
  it('voce con campi propri → i suoi', () => {
    expect(campiDiVoce({ campi: [c('sigillo', 1)] }, fallback).map((x) => x.chiave)).toEqual(['sigillo']);
  });
  it('voce senza campi / vuoti / null → fallback del rapportino', () => {
    expect(campiDiVoce({}, fallback)).toBe(fallback);
    expect(campiDiVoce({ campi: [] }, fallback)).toBe(fallback);
    expect(campiDiVoce({ campi: null }, fallback)).toBe(fallback);
    expect(campiDiVoce(undefined, fallback)).toBe(fallback);
  });
});

describe('unioneCampi', () => {
  it('base prima (nel suo ordine), extra per-voce dopo, dedup per chiave, ordine rinumerato', () => {
    const unione = unioneCampi(
      [c('eseguito', 2), c('note', 5)].reverse(),
      [[c('eseguito', 1), c('sigillo', 2)], null, [c('lettura', 1)]],
    );
    expect(unione.map((x) => x.chiave)).toEqual(['eseguito', 'note', 'sigillo', 'lettura']);
    expect(unione.map((x) => x.ordine)).toEqual([1, 2, 3, 4]);
  });
  it('nessun per-voce → base ordinata', () => {
    expect(unioneCampi([c('b', 2), c('a', 1)], []).map((x) => x.chiave)).toEqual(['a', 'b']);
  });
});
