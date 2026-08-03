import { describe, it, expect } from 'vitest';
import {
  MIN_PREFISSO_MATRICOLA, capCinqueCifre, censitoDaOrdine, prefissiMatricola,
} from './censitiMassive';

describe('capCinqueCifre', () => {
  // L'export del Cruscotto perde gli zeri iniziali: RIANO arriva «60», il master storico
  // scriveva «00039». Un CAP di due cifre finito sull'anagrafica dell'intervento è un dato rotto.
  it('ripristina gli zeri persi dall’export', () => {
    expect(capCinqueCifre('60')).toBe('00060');
    expect(capCinqueCifre('39')).toBe('00039');
  });
  it('lascia stare i CAP già interi e i valori non numerici', () => {
    expect(capCinqueCifre('00039')).toBe('00039');
    expect(capCinqueCifre('00060-A')).toBe('00060-A');
  });
  it('vuoto e assente restano niente', () => {
    expect(capCinqueCifre('')).toBeNull();
    expect(capCinqueCifre(null)).toBeNull();
  });
});

describe('censitoDaOrdine', () => {
  // `impianto` E `pdr` sono lo stesso codice sotto due nomi: verificato incrociando le due
  // tabelle su ZAGAROLO/LABICO (ref.pdr === ordini.impianto su ogni riga).
  it('porta l’ODL e traduce impianto → pdr', () => {
    expect(censitoDaOrdine({
      odl: '912492867', matricola: '202015211018', impianto: '4000283602',
      via: 'VIA DEL CAVONE', civico: '30', cap: '60', comune: 'RIANO', nominativo: null,
    })).toEqual({
      matricola: '202015211018', pdr: '4000283602', nominativo: null,
      indirizzo: 'VIA DEL CAVONE', civico: '30', comune: 'RIANO', cap: '00060', odl: '912492867',
    });
  });
});

describe('prefissiMatricola', () => {
  // Il pezzo che l'export taglia è sempre in CODA: il valore del registro è un PREFISSO di quello
  // letto sul contatore (SETA a 16 cifre sul misuratore, 15 nel registro).
  it('dal più lungo al più corto, a partire dalla matricola stessa', () => {
    const p = prefissiMatricola('SETA071225005173');
    expect(p[0]).toBe('SETA071225005173');
    expect(p).toContain('SETA07122500517');
    expect(p.at(-1)).toHaveLength(MIN_PREFISSO_MATRICOLA);
  });
  it('normalizza prima di tagliare (trattini e minuscole non contano)', () => {
    expect(prefissiMatricola('seta-0712 2500 5173')[0]).toBe('SETA071225005173');
  });
  // Sotto il minimo non si tagliano prefissi: un troncone corto collide con la matricola INTERA
  // di un altro misuratore, che comparirebbe fra i suggerimenti senza c'entrare niente.
  it('più corta del minimo → si cerca solo se stessa', () => {
    expect(prefissiMatricola('123456')).toEqual(['123456']);
  });
  it('vuota → niente da cercare', () => {
    expect(prefissiMatricola('  ')).toEqual([]);
  });
});
