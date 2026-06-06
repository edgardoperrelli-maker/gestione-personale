import { describe, it, expect } from 'vitest';
import { richiestaToIntervento } from './richiestaToIntervento';
import type { DatiInterventoManuale } from './types';

const dati: DatiInterventoManuale = {
  committente: 'italgas',
  anagrafica: {
    nominativo: 'Mario Rossi', odl: 'ODL9', pdr: 'PDR1', matricola: 'M1',
    via: 'Via Roma 1', comune: 'Roma', cap: '00100', fascia_oraria: '9-12',
    attivita: 'Sostituzione', coordinate: '41.9, 12.5',
  },
  risposte: { att_cess: true },
};
const ctx = { committente: 'italgas' as const, data: '2026-06-06', staff_id: 's1', piano_id: 'p1', territorio_id: 'terr1' };

describe('richiestaToIntervento', () => {
  it('mappa anagrafica → record intervento manuale', () => {
    expect(richiestaToIntervento(dati, ctx)).toMatchObject({
      committente: 'italgas',
      odl: 'ODL9',
      pdr: 'PDR1',
      nominativo: 'Mario Rossi',
      indirizzo: 'Via Roma 1',
      comune: 'Roma',
      cap: '00100',
      lat: 41.9,
      lng: 12.5,
      fascia_oraria: '9-12',
      matricola_contatore: 'M1',
      intervento_tipo: 'Sostituzione',
      data: '2026-06-06',
      staff_id: 's1',
      stato: 'assegnato',
      piano_id: 'p1',
      territorio_id: 'terr1',
      origine: 'manuale',
      created_from_mappa: false,
    });
  });
  it('odl vuoto/spazi → null', () => {
    const d = { ...dati, anagrafica: { ...dati.anagrafica, odl: '   ' } };
    expect(richiestaToIntervento(d, ctx).odl).toBeNull();
  });
  it('coordinate assenti o non parseabili → lat/lng null', () => {
    const d = { ...dati, anagrafica: { ...dati.anagrafica, coordinate: undefined } };
    const r = richiestaToIntervento(d, ctx);
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
  });
  it('piano_id e territorio_id opzionali → null', () => {
    const r = richiestaToIntervento(dati, { committente: 'acea', data: '2026-06-06', staff_id: 's1' });
    expect(r.piano_id).toBeNull();
    expect(r.territorio_id).toBeNull();
    expect(r.origine).toBe('manuale');
  });
});
