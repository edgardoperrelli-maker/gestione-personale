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
  it('TUTTE le voci con flusso proprio → la base (mai ereditata) NON produce colonne fantasma', () => {
    // Regressione DUNNING 22/07: modello di fallback "AGENDA AEREA" (campo esito) su rapportino
    // le cui voci usano tutte il flusso LIMITAZIONI/SOSPENSIONI → colonna ESITO vuota nel PDF.
    const unione = unioneCampi(
      [c('esito', 1)],
      [[c('eseguito', 1), c('sigillo', 2)], [c('eseguito', 1), c('sigillo', 2)]],
    );
    expect(unione.map((x) => x.chiave)).toEqual(['eseguito', 'sigillo']);
    expect(unione.map((x) => x.ordine)).toEqual([1, 2]);
  });
  it('basta UNA voce che eredita la base (campi vuoti) perché la base rientri nell\'unione', () => {
    const unione = unioneCampi([c('esito', 1)], [[c('eseguito', 1)], []]);
    expect(unione.map((x) => x.chiave)).toEqual(['esito', 'eseguito']);
  });
});
