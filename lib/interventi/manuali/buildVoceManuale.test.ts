import { describe, it, expect } from 'vitest';
import { buildVoceManuale, colonneAnagraficaVoce } from './buildVoceManuale';
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
  it('mappa anagrafica → colonne voce (odl→odl) + manuale/approvazione', () => {
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
      odl: 'ODL9',
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

describe('colonneAnagraficaVoce (riallineamento voce in approvazione)', () => {
  it('mappa l\'anagrafica corretta dal backoffice sulle colonne (PDR aggiunta, matricola corretta)', () => {
    const corretti: DatiInterventoManuale = {
      committente: 'italgas',
      anagrafica: { via: 'VIA A', matricola: 'MTSB033207656306', pdr: '00882101957377' },
      risposte: { eseguito: 'SI' },
    };
    expect(colonneAnagraficaVoce(corretti)).toMatchObject({
      via: 'VIA A',
      matricola: 'MTSB033207656306',
      pdr: '00882101957377',
      risposte: { eseguito: 'SI' },
    });
  });
  it('rifila spazi/tab dei valori e mappa il vuoto a null', () => {
    const d: DatiInterventoManuale = {
      committente: 'italgas',
      anagrafica: { pdr: '  00882101961924\t', matricola: '' },
      risposte: {},
    };
    const c = colonneAnagraficaVoce(d);
    expect(c.pdr).toBe('00882101961924');
    expect(c.matricola).toBeNull();
  });
});
