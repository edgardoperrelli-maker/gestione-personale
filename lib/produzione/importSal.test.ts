import { describe, it, expect } from 'vitest';
import {
  chiaveRiga, lottiDaExport, proponiLotti, righeDaLotti, type RigaExportSal,
} from './importSal';

const riga = (over: Partial<RigaExportSal> = {}): RigaExportSal => ({
  docAcquisti: '4206329130',
  posizione: '10',
  odl: '957276160',
  valoreAps: 25.46,
  causa: 'EFRE',
  attivita: 'Limitazione flusso idrico',
  dataCompletamento: '2026-06-10',
  dataRegistrazione: '2026-07-08',
  ...over,
});

describe('lottiDaExport', () => {
  it('separa i lotti per data di registrazione, dal più vecchio', () => {
    const lotti = lottiDaExport([
      riga({ posizione: '10', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-02' }),
      riga({ posizione: '20', dataRegistrazione: '2026-07-08', dataCompletamento: '2026-06-10' }),
      riga({ posizione: '30', dataRegistrazione: '2026-07-08', dataCompletamento: '2026-06-11' }),
    ]);
    expect(lotti.map((l) => l.dataRegistrazione)).toEqual(['2026-07-08', '2026-07-31']);
    expect(lotti[0].righe).toHaveLength(2);
    expect(lotti[0].valore).toBe(50.92);
  });

  it('mese di competenza = mese prevalente delle date di completamento', () => {
    const lotti = lottiDaExport([
      riga({ posizione: '10', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-06-30' }),
      riga({ posizione: '20', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-02' }),
      riga({ posizione: '30', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-03' }),
    ]);
    expect(lotti[0].meseCompetenza).toBe('2026-07');
  });

  it('dedup per chiave naturale (documento, posizione): vince la prima', () => {
    const lotti = lottiDaExport([
      riga({ valoreAps: 25.46 }),
      riga({ valoreAps: 99 }), // stessa doc|pos → scartata
      riga({ posizione: '20', valoreAps: 10 }),
    ]);
    expect(lotti[0].righe).toHaveLength(2);
    expect(lotti[0].valore).toBe(35.46);
  });

  it('scarta le righe senza Ordine', () => {
    expect(lottiDaExport([riga({ odl: '  ' })])).toEqual([]);
  });

  it('conta gli ODL distinti, non le righe', () => {
    const lotti = lottiDaExport([
      riga({ posizione: '10', odl: 'A' }),
      riga({ posizione: '20', odl: 'A' }),
      riga({ posizione: '30', odl: 'B' }),
    ]);
    expect(lotti[0]).toMatchObject({ ordini: 2 });
    expect(lotti[0].righe).toHaveLength(3);
  });
});

describe('proponiLotti', () => {
  /*
    Il caso reale che ha fatto nascere il modulo: l'export di agosto 2026 contiene il SAL 1 (già
    caricato, registrato l'08/07, lavori di giugno) e il SAL 2 in due lotti — il grosso registrato
    il 31/07 e una coda di 16 righe registrata il 03/08, entrambi con lavori di luglio.
  */
  const lotti = lottiDaExport([
    riga({ docAcquisti: 'D1', posizione: '10', dataRegistrazione: '2026-07-08', dataCompletamento: '2026-06-10' }),
    riga({ docAcquisti: 'D1', posizione: '20', dataRegistrazione: '2026-07-08', dataCompletamento: '2026-06-11' }),
    riga({ docAcquisti: 'D2', posizione: '10', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-02' }),
    riga({ docAcquisti: 'D2', posizione: '20', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-03' }),
    riga({ docAcquisti: 'D3', posizione: '10', dataRegistrazione: '2026-08-03', dataCompletamento: '2026-07-28' }),
  ]);
  const salInDb = new Map([['D1|10', 1], ['D1|20', 1]]);

  it('riconosce il SAL già caricato invece di dargli un numero nuovo', () => {
    const p = proponiLotti(lotti, salInDb, 1);
    expect(p[0]).toMatchObject({ dataRegistrazione: '2026-07-08', salN: 1, giaCaricato: true, righeGiaInDb: 2 });
  });

  it('accorpa nello stesso SAL i lotti nuovi con lo stesso mese di competenza', () => {
    const p = proponiLotti(lotti, salInDb, 1);
    expect(p[1]).toMatchObject({ dataRegistrazione: '2026-07-31', salN: 2, giaCaricato: false });
    expect(p[2]).toMatchObject({ dataRegistrazione: '2026-08-03', salN: 2, giaCaricato: false });
  });

  it('mesi di competenza diversi → numeri progressivi diversi', () => {
    const p = proponiLotti(lottiDaExport([
      riga({ docAcquisti: 'A', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-02' }),
      riga({ docAcquisti: 'B', dataRegistrazione: '2026-08-31', dataCompletamento: '2026-08-02' }),
    ]), new Map(), 1);
    expect(p.map((l) => l.salN)).toEqual([2, 3]);
  });

  it('database vuoto → si parte da 1', () => {
    const p = proponiLotti(lotti, new Map(), 0);
    expect(p.map((l) => l.salN)).toEqual([1, 2, 2]);
  });

  it('lotto riconosciuto solo in minoranza → è un SAL nuovo, non quello vecchio', () => {
    // Una sola riga su tre già in DB: è un aggancio troppo debole per dire «questo lotto è il SAL 1»
    // (capita quando ACEA sposta un ordine da un SAL all'altro).
    const tre = lottiDaExport([
      riga({ docAcquisti: 'X', posizione: '10', dataRegistrazione: '2026-09-01', dataCompletamento: '2026-08-01' }),
      riga({ docAcquisti: 'X', posizione: '20', dataRegistrazione: '2026-09-01', dataCompletamento: '2026-08-02' }),
      riga({ docAcquisti: 'X', posizione: '30', dataRegistrazione: '2026-09-01', dataCompletamento: '2026-08-03' }),
    ]);
    const p = proponiLotti(tre, new Map([['X|10', 1]]), 2);
    expect(p[0]).toMatchObject({ salN: 3, giaCaricato: false, righeGiaInDb: 1 });
  });

  it('lotti senza data di completamento non si accorpano fra loro', () => {
    const muti = lottiDaExport([
      riga({ docAcquisti: 'A', dataRegistrazione: '2026-07-31', dataCompletamento: null }),
      riga({ docAcquisti: 'B', dataRegistrazione: '2026-08-03', dataCompletamento: null }),
    ]);
    expect(proponiLotti(muti, new Map(), 0).map((l) => l.salN)).toEqual([1, 2]);
  });
});

describe('righeDaLotti', () => {
  const lotti = lottiDaExport([
    riga({ docAcquisti: 'D1', posizione: '10', dataRegistrazione: '2026-07-08' }),
    riga({ docAcquisti: 'D2', posizione: '10', dataRegistrazione: '2026-07-31', dataCompletamento: '2026-07-02' }),
    riga({ docAcquisti: 'D3', posizione: '10', dataRegistrazione: '2026-08-03', dataCompletamento: '2026-07-28' }),
  ]);

  it('i lotti non assegnati non si toccano', () => {
    const out = righeDaLotti(lotti, new Map([['2026-07-31', 2]]));
    expect([...out.keys()]).toEqual([2]);
    expect(out.get(2)).toHaveLength(1);
  });

  it('due lotti sullo stesso numero finiscono nello stesso SAL', () => {
    const out = righeDaLotti(lotti, new Map([['2026-07-31', 2], ['2026-08-03', 2]]));
    expect(out.get(2)).toHaveLength(2);
    expect(out.get(2)?.map((r) => r.doc_acquisti)).toEqual(['D2', 'D3']);
  });

  it('mappa i campi sulla riga di acea_sal', () => {
    const out = righeDaLotti(lotti, new Map([['2026-07-08', 1]]));
    expect(out.get(1)?.[0]).toEqual({
      sal_n: 1,
      odl: '957276160',
      doc_acquisti: 'D1',
      posizione: '10',
      valore: 25.46,
      causa: 'EFRE',
      attivita: 'Limitazione flusso idrico',
      data_completamento: '2026-06-10',
      data_registrazione: '2026-07-08',
    });
  });

  it('numero SAL non valido → lotto ignorato', () => {
    expect(righeDaLotti(lotti, new Map([['2026-07-08', 0]])).size).toBe(0);
  });
});

describe('chiaveRiga', () => {
  it('è documento|posizione', () => {
    expect(chiaveRiga({ docAcquisti: 'D', posizione: '10' })).toBe('D|10');
  });
});
