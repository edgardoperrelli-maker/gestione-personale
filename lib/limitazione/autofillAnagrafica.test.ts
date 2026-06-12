import { describe, it, expect } from 'vitest';
import { autofillAnagrafica, type CensitoMisuratore } from './autofillAnagrafica';

const base: CensitoMisuratore = {
  matricola: 'A023041', pdr: '00123', nominativo: 'Rossi Mario',
  indirizzo: 'Via Roma', civico: '12', comune: 'Firenze', cap: '50100',
};

describe('autofillAnagrafica', () => {
  it('mappa i campi e concatena civico alla via', () => {
    expect(autofillAnagrafica(base)).toEqual({
      matricola: 'A023041', pdr: '00123', nominativo: 'Rossi Mario',
      via: 'Via Roma 12', comune: 'Firenze', cap: '50100',
    });
  });

  it('omette i campi vuoti', () => {
    expect(autofillAnagrafica({ matricola: 'X1', indirizzo: 'Via Po' })).toEqual({
      matricola: 'X1', via: 'Via Po',
    });
  });
});
