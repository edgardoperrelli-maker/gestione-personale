import { describe, it, expect } from 'vitest';
import { lookupMaster, type RigaMaster } from './lookupMaster';

const R = (o: Partial<RigaMaster>): RigaMaster =>
  ({ odl: '', matricola: '', indirizzo: '', comune: '', cap: '', ...o });

describe('lookupMaster', () => {
  const righe = [
    R({ odl: 'A1', matricola: '99A023041', indirizzo: 'VIA ROMA 1', comune: 'TERRACINA' }),
    R({ odl: 'B2', matricola: 'C-100 200', indirizzo: 'VIA PO 2', comune: 'TERRACINA' }),
  ];

  it('gradino 1 — match letterale: via libera, nessuna conferma', () => {
    const v = lookupMaster('99A023041', righe);
    expect(v.esito).toBe('letterale');
    if (v.esito === 'letterale') expect(v.riga.odl).toBe('A1');
  });

  it('gradino 2 — normalizzato ma non letterale: conferma su UN candidato', () => {
    const v = lookupMaster('c100200', righe);
    expect(v.esito).toBe('conferma');
    if (v.esito === 'conferma') expect(v.candidati.map((r) => r.odl)).toEqual(['B2']);
  });

  it('gradino 3 — prefisso variabile: conferma sui simili', () => {
    const v = lookupMaster('A023041', righe);
    expect(v.esito).toBe('conferma');
    if (v.esito === 'conferma') expect(v.candidati.map((r) => r.odl)).toEqual(['A1']);
  });

  it('gradino 4 — nessun candidato: blocco', () => {
    expect(lookupMaster('ZZZ99999', righe).esito).toBe('assente');
  });

  it('q vuota o troppo corta → assente (mai un match casuale)', () => {
    expect(lookupMaster('', righe).esito).toBe('assente');
    expect(lookupMaster('99', righe).esito).toBe('assente');
  });

  it('cascata: stessa matricola, STESSO odl su due righe → riga singola (duplicato innocuo)', () => {
    const dup = [
      R({ odl: 'A1', matricola: '99A023041', indirizzo: 'VIA ROMA 1' }),
      R({ odl: 'A1', matricola: '99A023041', comune: 'TERRACINA' }), // campi complementari
    ];
    const v = lookupMaster('99A023041', dup);
    expect(v.esito).toBe('letterale');
    // fusione difensiva: i vuoti della prima si riempiono dalla seconda
    if (v.esito === 'letterale') {
      expect(v.riga.indirizzo).toBe('VIA ROMA 1');
      expect(v.riga.comune).toBe('TERRACINA');
    }
  });

  it('cascata: ODL diversi e indirizzi DIVERSI → scelta all operatore', () => {
    const due = [
      R({ odl: 'A1', matricola: 'M1', indirizzo: 'VIA ROMA 1', comune: 'TERRACINA' }),
      R({ odl: 'A2', matricola: 'M1', indirizzo: 'VIA PO 9', comune: 'TERRACINA' }),
    ];
    const v = lookupMaster('M1', due);
    expect(v.esito).toBe('conferma');
    if (v.esito === 'conferma') expect(v.candidati.map((r) => r.odl).sort()).toEqual(['A1', 'A2']);
  });

  it('cascata: ODL diversi e indirizzi IDENTICI → ambiguo, blocco', () => {
    const due = [
      R({ odl: 'A1', matricola: 'M1', indirizzo: 'VIA ROMA 1', comune: 'TERRACINA' }),
      R({ odl: 'A2', matricola: 'M1', indirizzo: 'via roma  1', comune: 'terracina' }),
    ];
    const v = lookupMaster('M1', due);
    expect(v.esito).toBe('ambiguo');
    if (v.esito === 'ambiguo') expect(v.odl.sort()).toEqual(['A1', 'A2']);
  });

  it('righe senza matricola: ignorate, non producono match', () => {
    expect(lookupMaster('M1', [R({ odl: 'X', matricola: '' })]).esito).toBe('assente');
  });

  it('il match letterale NON scavalca l ambiguita di ODL', () => {
    const due = [
      R({ odl: 'A1', matricola: 'M1', indirizzo: 'VIA ROMA 1' }),
      R({ odl: 'A2', matricola: 'M1', indirizzo: 'VIA PO 9' }),
    ];
    expect(lookupMaster('M1', due).esito).toBe('conferma'); // non 'letterale'
  });
});
