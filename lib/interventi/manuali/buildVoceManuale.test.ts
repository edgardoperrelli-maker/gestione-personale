import { describe, it, expect } from 'vitest';
import { buildVoceManuale } from './buildVoceManuale';
import type { DatiInterventoManuale } from './types';

const dati: DatiInterventoManuale = {
  committente: 'acea',
  anagrafica: {
    nominativo: 'Mario Rossi', matricola: 'M1', pdr: 'PDR1', odl: 'ODL9',
    via: 'Via Roma 1', comune: 'Roma', cap: '00100', recapito: '333',
    attivita: 'Sostituzione', accessibilita: 'Libero', fascia_oraria: '9-12',
    coordinate: '41.9, 12.5',
  },
  risposte: { att_cess: true, note: 'urgente' },
};

describe('buildVoceManuale', () => {
  it('mappa anagrafica → colonne voce (odl→odsin) + manuale/approvazione', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 7, dati });
    expect(v).toMatchObject({
      rapportino_id: 'rap1',
      richiesta_id: 'req1',
      ordine: 7,
      manuale: true,
      approvazione_stato: 'in_attesa',
      nominativo: 'Mario Rossi',
      matricola: 'M1',
      pdr: 'PDR1',
      odsin: 'ODL9',
      via: 'Via Roma 1',
      comune: 'Roma',
      cap: '00100',
      recapito: '333',
      attivita: 'Sostituzione',
      accessibilita: 'Libero',
      fascia_oraria: '9-12',
      risposte: { att_cess: true, note: 'urgente' },
    });
  });
  it('porta la coordinata nel raw_json e marca _nuovo', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati });
    expect(v.raw_json).toMatchObject({ coordinate: '41.9, 12.5', _nuovo: true });
  });
  it('campi assenti → null/undefined senza crash', () => {
    const vuoto: DatiInterventoManuale = { committente: 'altro', anagrafica: {}, risposte: {} };
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati: vuoto });
    expect(v.nominativo ?? null).toBeNull();
    expect(v.risposte).toEqual({});
  });
});
