import { describe, expect, it } from 'vitest';
import { aggregaCandele, type RigaCandela } from './aggregaCandele';

const SETTIMANA = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

const r = (p: Partial<RigaCandela>): RigaCandela => ({
  staffId: 's1', operatore: 'ROSSI', data: '2026-06-01', esitoOk: true, valoreDedup: 0, ...p,
});

describe('aggregaCandele', () => {
  it('insieme vuoto → nessun operatore', () => {
    expect(aggregaCandele([], SETTIMANA)).toEqual([]);
  });

  it('un operatore ha sempre 7 giorni, anche a zero', () => {
    const out = aggregaCandele([r({})], SETTIMANA);
    expect(out).toHaveLength(1);
    expect(out[0].giorni).toHaveLength(7);
    expect(out[0].giorni.map((g) => g.data)).toEqual(SETTIMANA);
  });

  it('conta positivi/negativi/non lavorati per giorno', () => {
    const out = aggregaCandele([
      r({ data: '2026-06-01', esitoOk: true }),
      r({ data: '2026-06-01', esitoOk: true }),
      r({ data: '2026-06-01', esitoOk: false }),
      r({ data: '2026-06-02', esitoOk: null }),
    ], SETTIMANA);
    const lun = out[0].giorni.find((g) => g.data === '2026-06-01')!;
    expect(lun).toMatchObject({ positivi: 2, negativi: 1, nonLavorati: 0, assegnati: 3 });
    const mar = out[0].giorni.find((g) => g.data === '2026-06-02')!;
    expect(mar).toMatchObject({ positivi: 0, negativi: 0, nonLavorati: 1, assegnati: 1 });
  });

  it('somma valoreDedup per giorno, arrotondato a 2 decimali', () => {
    const out = aggregaCandele([
      r({ data: '2026-06-01', valoreDedup: 10.005 }),
      r({ data: '2026-06-01', valoreDedup: 5 }),
    ], SETTIMANA);
    expect(out[0].giorni[0].valore).toBe(15.01);
  });

  it('conteggi NON deduplicati, valore SÌ: 2 righe stesso caso dedup → assegnati=2, valore=1×prezzo', () => {
    // simula l'esito del loader dopo deduplicaMassivePerMatricola: la riga "vincitrice" porta il
    // valore, l'altra resta a 0 pur essendo un esito positivo reale (criterio di accettazione #2).
    const out = aggregaCandele([
      r({ data: '2026-06-01', esitoOk: true, valoreDedup: 50 }),
      r({ data: '2026-06-03', esitoOk: true, valoreDedup: 0 }),
    ], SETTIMANA);
    const tot = out[0].giorni.reduce((s, g) => s + g.assegnati, 0);
    const val = out[0].giorni.reduce((s, g) => s + g.valore, 0);
    expect(tot).toBe(2);
    expect(val).toBe(50);
  });

  it('riga con staffId vuoto viene scartata', () => {
    expect(aggregaCandele([r({ staffId: '' })], SETTIMANA)).toEqual([]);
  });

  it('riga con data fuori dalla settimana viene ignorata', () => {
    expect(aggregaCandele([r({ data: '2026-05-31' })], SETTIMANA)).toEqual([]);
  });

  it('ordina gli operatori per totale assegnati desc', () => {
    const out = aggregaCandele([
      r({ staffId: 'a', operatore: 'A', data: '2026-06-01' }),
      r({ staffId: 'b', operatore: 'B', data: '2026-06-01' }),
      r({ staffId: 'b', operatore: 'B', data: '2026-06-02' }),
    ], SETTIMANA);
    expect(out.map((o) => o.chiave)).toEqual(['b', 'a']);
  });
});
