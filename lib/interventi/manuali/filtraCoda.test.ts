import { describe, it, expect } from 'vitest';
import { datiAnagraficaCoda, filtraCoda } from './filtraCoda';

const riga = (over: Record<string, unknown> = {}) => ({
  staff_id: 's1',
  committente: 'lim_massive',
  dati_correnti: { anagrafica: { via: 'Via Roma 1', matricola: 'M123', odl: 'ODL9', attivita: 'LIMITAZIONI MASSIVE' } },
  dati_operatore: { anagrafica: { via: 'vecchia' } },
  ...over,
});

describe('datiAnagraficaCoda', () => {
  it('estrae via/matricola/odl/attivita da dati_correnti (vince su operatore)', () => {
    expect(datiAnagraficaCoda(riga())).toEqual({ via: 'Via Roma 1', matricola: 'M123', odl: 'ODL9', attivita: 'LIMITAZIONI MASSIVE' });
  });
  it('fallback a dati_operatore e stringhe vuote se assenti', () => {
    expect(datiAnagraficaCoda({ dati_operatore: { anagrafica: { matricola: 'X' } } })).toEqual({ via: '', matricola: 'X', odl: '', attivita: '' });
    expect(datiAnagraficaCoda({})).toEqual({ via: '', matricola: '', odl: '', attivita: '' });
  });
});

describe('filtraCoda', () => {
  const righe = [
    riga(),
    riga({ staff_id: 's2', dati_correnti: { anagrafica: { via: 'Corso Milano 5', matricola: 'M999', odl: 'ODL1', attivita: 'BONIFICHE EXTRA' } } }),
  ];
  const vuoto = { ricerca: '', operatore: '', committente: '', attivita: '' };
  it('nessun filtro → tutte', () => {
    expect(filtraCoda(righe, vuoto)).toHaveLength(2);
  });
  it('filtro operatore', () => {
    expect(filtraCoda(righe, { ...vuoto, operatore: 's2' }).map((r) => r.staff_id)).toEqual(['s2']);
  });
  it('filtro attivita', () => {
    expect(filtraCoda(righe, { ...vuoto, attivita: 'BONIFICHE EXTRA' })).toHaveLength(1);
  });
  it('ricerca per matricola (case-insensitive substring)', () => {
    expect(filtraCoda(righe, { ...vuoto, ricerca: 'm99' })).toHaveLength(1);
  });
  it('ricerca per via', () => {
    expect(filtraCoda(righe, { ...vuoto, ricerca: 'roma' }).map((r) => r.staff_id)).toEqual(['s1']);
  });
  it('AND tra filtro e ricerca', () => {
    expect(filtraCoda(righe, { ...vuoto, operatore: 's1', ricerca: 'milano' })).toHaveLength(0);
  });
});
