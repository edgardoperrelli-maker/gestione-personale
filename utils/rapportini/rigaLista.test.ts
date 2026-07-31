import { describe, it, expect } from 'vitest';
import {
  LISTA_META_DEFAULT,
  LISTA_SUB_DEFAULT,
  fasciaBreve,
  resolveListaCampi,
  testoRiga,
  valoreRiga,
} from './rigaLista';

const VOCE = {
  nominativo: 'Mario Rossi',
  matricola: 'MAT0012345',
  odl: '20043151148',
  via: 'VIA ROMA 1',
  comune: 'Roma',
  attivita: 'S-PR-007',
  fascia_oraria: '31/07/2026 08:00',
};

describe('resolveListaCampi', () => {
  it('senza config usa i default storici (via · comune, attività · fascia)', () => {
    expect(resolveListaCampi(null)).toEqual({ sub: LISTA_SUB_DEFAULT, meta: LISTA_META_DEFAULT });
    expect(resolveListaCampi({})).toEqual({ sub: LISTA_SUB_DEFAULT, meta: LISTA_META_DEFAULT });
  });

  it('tiene ordine e scelta dell’admin', () => {
    expect(resolveListaCampi({ sub: ['comune', 'via'], meta: ['odl'] })).toEqual({
      sub: ['comune', 'via'],
      meta: ['odl'],
    });
  });

  it('lista vuota = slot spento, non fallback (l’admin l’ha svuotato apposta)', () => {
    expect(resolveListaCampi({ sub: [], meta: [] })).toEqual({ sub: [], meta: [] });
  });

  it('scarta le chiavi sconosciute e i valori non-array', () => {
    expect(resolveListaCampi({ sub: ['via', 'inventata', 42], meta: 'boh' })).toEqual({
      sub: ['via'],
      meta: LISTA_META_DEFAULT,
    });
  });

  it('uno slot configurato non trascina l’altro', () => {
    expect(resolveListaCampi({ meta: [] })).toEqual({ sub: LISTA_SUB_DEFAULT, meta: [] });
  });
});

describe('testoRiga', () => {
  it('unisce i valori non vuoti nell’ordine scelto', () => {
    expect(testoRiga(VOCE, ['via', 'comune'])).toBe('VIA ROMA 1 · Roma');
    expect(testoRiga(VOCE, ['comune', 'via'])).toBe('Roma · VIA ROMA 1');
  });

  it('salta i campi vuoti senza lasciare separatori penzolanti', () => {
    expect(testoRiga({ via: 'VIA ROMA 1' }, ['via', 'comune', 'pdr'])).toBe('VIA ROMA 1');
  });

  it('nessuna chiave = testo vuoto (slot spento)', () => {
    expect(testoRiga(VOCE, [])).toBe('');
  });

  it('la fascia si accorcia anche dentro la riga composta', () => {
    expect(testoRiga(VOCE, ['attivita', 'fascia_oraria'])).toBe('S-PR-007 · 08:00');
  });
});

describe('valoreRiga / fasciaBreve', () => {
  it('toglie la data dalla fascia, tiene l’orario', () => {
    expect(fasciaBreve('31/07/2026 08:00-10:00')).toBe('08:00-10:00');
    expect(valoreRiga(VOCE, 'fascia_oraria')).toBe('08:00');
  });

  it('se resta solo la data non svuota la cella', () => {
    expect(fasciaBreve('31/07/2026')).toBe('31/07/2026');
  });

  it('gli altri campi passano intatti', () => {
    expect(valoreRiga(VOCE, 'odl')).toBe('20043151148');
  });
});
