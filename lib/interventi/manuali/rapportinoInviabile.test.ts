import { describe, it, expect } from 'vitest';
import { rapportinoInviabile } from './rapportinoInviabile';

describe('rapportinoInviabile', () => {
  it('nessuna voce manuale → inviabile, 0 in sospeso', () => {
    expect(rapportinoInviabile([{ approvazione_stato: null }, { approvazione_stato: null }]))
      .toEqual({ inviabile: true, inSospeso: 0 });
  });
  it('una in_attesa → non inviabile', () => {
    expect(rapportinoInviabile([{ approvazione_stato: 'in_attesa' }, { approvazione_stato: null }]))
      .toEqual({ inviabile: false, inSospeso: 1 });
  });
  it('conta tutte le in_attesa', () => {
    expect(rapportinoInviabile([
      { approvazione_stato: 'in_attesa' },
      { approvazione_stato: 'in_attesa' },
      { approvazione_stato: 'approvato' },
    ])).toEqual({ inviabile: false, inSospeso: 2 });
  });
  it('approvato/rifiutato non bloccano', () => {
    expect(rapportinoInviabile([{ approvazione_stato: 'approvato' }, { approvazione_stato: 'rifiutato' }]))
      .toEqual({ inviabile: true, inSospeso: 0 });
  });
  it('lista vuota → inviabile', () => {
    expect(rapportinoInviabile([])).toEqual({ inviabile: true, inSospeso: 0 });
  });
});
