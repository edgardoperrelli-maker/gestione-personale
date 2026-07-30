import { describe, it, expect } from 'vitest';
import { costruisciMasterOdl, isOdlReale, type FonteMaster } from './masterOdl';
import { buildTassonomiaIndex, type TassonomiaRiga } from './tassonomia';

const TASSONOMIA: TassonomiaRiga[] = [
  { committente: 'acea', descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'acea', descrizione: 'Sospensione', descrizioneNorm: 'SOSPENSIONE', gruppo: 'DUNNING', attivo: true },
  { committente: 'acqualatina', descrizione: 'Sostituzione misuratore', descrizioneNorm: 'SOSTITUZIONE MISURATORE', gruppo: 'SOSTITUZIONE MISURATORI', attivo: true },
  { committente: 'acea', descrizione: 'SPENTA', descrizioneNorm: 'SPENTA', gruppo: 'X', attivo: false },
];
const index = buildTassonomiaIndex(TASSONOMIA);

const fonte = (righe: FonteMaster['righe'], extra?: Partial<FonteMaster>): FonteMaster =>
  ({ committente: 'acea', righe, ...extra });

describe('isOdlReale', () => {
  it('scarta vuoto e pseudo-chiavi MAT:', () => {
    expect(isOdlReale('')).toBe(false);
    expect(isOdlReale('MAT:12345')).toBe(false);
    expect(isOdlReale('mat:12345')).toBe(false);
    expect(isOdlReale('912246906')).toBe(true);
  });
});

describe('costruisciMasterOdl', () => {
  it('trim dei campi, descrizione canonica dalla tassonomia (case-insensitive)', () => {
    const out = costruisciMasterOdl([fonte([
      { odl: ' 912000001 ', operazione: 'SOSPENSIONE', matricola: ' M1 ', indirizzo: ' VIA ROMA 1 ', cap: ' 00030 ', comune: ' LABICO ' },
    ])], index);
    expect(out).toEqual([{
      odl: '912000001', descrizione: 'Sospensione', matricola: 'M1', indirizzo: 'VIA ROMA 1', cap: '00030', comune: 'LABICO',
    }]);
  });

  it("operazione non risolvibile → descrizione '' (la cella resta da compilare)", () => {
    const out = costruisciMasterOdl([fonte([{ odl: '1', operazione: 'BOH IGNOTA' }])], index);
    expect(out[0].descrizione).toBe('');
  });

  it('UNA attività selezionata: riempie SOLO le righe senza operazione propria', () => {
    const out = costruisciMasterOdl([fonte([
      { odl: '1' },
      { odl: '2', operazione: 'Sospensione' },
    ], { operazioniDefault: ['limitazioni massive'] })], index);
    expect(out.find((r) => r.odl === '1')?.descrizione).toBe('LIMITAZIONI MASSIVE');
    expect(out.find((r) => r.odl === '2')?.descrizione).toBe('Sospensione');
  });

  it('PIÙ attività selezionate: non si può decidere per riga → descrizione vuota (si sceglie in Excel)', () => {
    const out = costruisciMasterOdl([fonte([
      { odl: '1' },
      { odl: '2', operazione: 'Sospensione' }, // la propria operazione vince comunque
    ], { operazioniDefault: ['LIMITAZIONI MASSIVE', 'Sospensione'] })], index);
    expect(out.find((r) => r.odl === '1')?.descrizione).toBe('');
    expect(out.find((r) => r.odl === '2')?.descrizione).toBe('Sospensione');
  });

  it('il committente della fonte guida la risoluzione (acqualatina)', () => {
    const out = costruisciMasterOdl([
      { committente: 'acqualatina', righe: [{ odl: '7', operazione: 'sostituzione misuratore' }] },
    ], index);
    expect(out[0].descrizione).toBe('Sostituzione misuratore');
  });

  it('fusione difensiva: la prima fonte vince, i campi vuoti si riempiono dalle successive', () => {
    const caricato = fonte([{ odl: '5', operazione: 'LIMITAZIONI MASSIVE', indirizzo: 'VIA VERDI 2', cap: '00060', comune: '' }]);
    const snapshot = fonte([{ odl: '5', operazione: 'Sospensione', matricola: 'M5', comune: 'RIANO' }]);
    const out = costruisciMasterOdl([caricato, snapshot], index);
    expect(out).toEqual([{
      odl: '5',
      descrizione: 'LIMITAZIONI MASSIVE', // della prima fonte, non sovrascritta
      matricola: 'M5',                    // vuoto nella prima → riempito dalla seconda
      indirizzo: 'VIA VERDI 2',
      cap: '00060',
      comune: 'RIANO',
    }]);
  });

  it('scarta righe senza ODL reale (vuote e MAT:)', () => {
    const out = costruisciMasterOdl([fonte([
      { odl: '', matricola: 'M1' },
      { odl: 'MAT:999', matricola: 'M2' },
      { odl: '3', matricola: 'M3' },
    ])], index);
    expect(out.map((r) => r.odl)).toEqual(['3']);
  });
});
