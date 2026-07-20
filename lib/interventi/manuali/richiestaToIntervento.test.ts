import { describe, it, expect } from 'vitest';
import { richiestaToIntervento } from './richiestaToIntervento';
import type { DatiInterventoManuale } from './types';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

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

const INDICE = buildTassonomiaIndex([
  { committente: 'acea', descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
] as TassonomiaRiga[]);

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
      stato: 'completato',
      esito: 'eseguito_positivo',
      piano_id: 'p1',
      territorio_id: 'terr1',
      origine: 'manuale',
      created_from_mappa: false,
    });
  });
  it('crea l’intervento già completato a esito positivo (il + è sempre positivo)', () => {
    const r = richiestaToIntervento(dati, ctx);
    expect(r.stato).toBe('completato');
    expect(r.esito).toBe('eseguito_positivo');
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
  it('lim_massive + attività riconosciuta (con indice) → descrizione canonica + gruppo', () => {
    const d: DatiInterventoManuale = { ...dati, anagrafica: { ...dati.anagrafica, attivita: ' limitazioni  massive ' } };
    const c = { ...ctx, committente: 'lim_massive' as const };
    const r = richiestaToIntervento(d, c, INDICE);
    expect(r.intervento_tipo).toBe('LIMITAZIONI MASSIVE');
    expect(r.gruppo_attivita).toBe('LIMITAZIONI MASSIVE');
  });
  it('attività ignota (con indice) → testo così com\'è, gruppo null (retro-compat coda offline)', () => {
    const d: DatiInterventoManuale = { ...dati, anagrafica: { ...dati.anagrafica, attivita: 'LIBERA' } };
    const c = { ...ctx, committente: 'altro' as const };
    const r = richiestaToIntervento(d, c, INDICE);
    expect(r.intervento_tipo).toBe('LIBERA');
    expect(r.gruppo_attivita).toBeNull();
  });
  it('senza indice (retro-compat chiamanti pre-esistenti) → comportamento storico, gruppo null', () => {
    const r = richiestaToIntervento(dati, ctx);
    expect(r.intervento_tipo).toBe('Sostituzione');
    expect(r.gruppo_attivita).toBeNull();
  });
});
