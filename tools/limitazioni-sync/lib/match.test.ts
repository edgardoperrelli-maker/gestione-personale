// tools/limitazioni-sync/lib/match.test.ts
import { describe, it, expect } from 'vitest';
import { norm, buildIndice, agganciaRiga, trovaExtra, vinceLavoro } from './match.mjs';

const lavori = [
  { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', manuale: false },
  { id: 'b', odl: null, matricola: '202315612361', comune: 'ZAGAROLO', manuale: true },
  { id: 'c', odl: null, matricola: '999', comune: 'TIVOLI', manuale: true },
];

describe('norm', () => {
  it('maiuscolo senza spazi', () => {
    expect(norm(' 912 231 020 ')).toBe('912231020');
  });
});

describe('agganciaRiga', () => {
  const idx = buildIndice(lavori);
  it('aggancia per ODL', () => {
    expect(agganciaRiga({ odl: '912231020', matricola: 'x' }, idx, 'ZAGAROLO')).toEqual({
      lavoro: lavori[0], via: 'odl',
    });
  });
  it('fallback per matricola nello stesso comune', () => {
    expect(agganciaRiga({ odl: '', matricola: '202315612361' }, idx, 'ZAGAROLO')).toEqual({
      lavoro: lavori[1], via: 'matricola',
    });
  });
  it('NON aggancia matricola di comune diverso', () => {
    expect(agganciaRiga({ odl: '', matricola: '999' }, idx, 'ZAGAROLO')).toBeNull();
  });
});

describe('trovaExtra', () => {
  it('solo manuali non consumati', () => {
    const extra = trovaExtra(lavori, new Set(['b']));
    expect(extra.map((l) => l.id)).toEqual(['c']);
  });
});

describe('vinceLavoro', () => {
  const neg17 = { id: 'n', esitoOk: false, data_esecuzione: '2026-06-17' };
  const pos18 = { id: 'p', esitoOk: true, data_esecuzione: '2026-06-18' };
  const pos16 = { id: 'q', esitoOk: true, data_esecuzione: '2026-06-16' };
  const neg19 = { id: 'r', esitoOk: false, data_esecuzione: '2026-06-19' };

  it('il positivo batte il negativo a prescindere dalla data', () => {
    expect(vinceLavoro(neg17, pos18)).toBe(pos18);
    expect(vinceLavoro(pos18, neg17)).toBe(pos18);
    // positivo più VECCHIO batte comunque un negativo più recente
    expect(vinceLavoro(neg19, pos16)).toBe(pos16);
    expect(vinceLavoro(pos16, neg19)).toBe(pos16);
  });

  it('a parità di esito vince la data più recente', () => {
    expect(vinceLavoro(pos16, pos18)).toBe(pos18);
    expect(vinceLavoro(pos18, pos16)).toBe(pos18);
    expect(vinceLavoro(neg17, neg19)).toBe(neg19);
  });

  it('a parità piena tiene il primo (stabile)', () => {
    const a = { id: 'a', esitoOk: true, data_esecuzione: '2026-06-18' };
    const b = { id: 'b', esitoOk: true, data_esecuzione: '2026-06-18' };
    expect(vinceLavoro(a, b)).toBe(a);
  });

  it('null/non lavorato perde contro il positivo e contro il negativo', () => {
    const nullo = { id: 'x', esitoOk: null, data_esecuzione: '2026-06-20' };
    expect(vinceLavoro(nullo, pos16)).toBe(pos16);
    // stesso "non positivo": vince la data più recente (nullo è il 20)
    expect(vinceLavoro(nullo, neg17)).toBe(nullo);
  });
});

describe('buildIndice: vincitore per chiave duplicata', () => {
  const base = { odl: '912230528', matricola: '202015249888', comune: 'ZAGAROLO', manuale: false };
  const neg = { ...base, id: 'neg', esitoOk: false, data_esecuzione: '2026-06-17' };
  const pos = { ...base, id: 'pos', esitoOk: true, data_esecuzione: '2026-06-18' };

  it('tiene il positivo anche se inserito PRIMA del negativo (no last-wins)', () => {
    const idx = buildIndice([pos, neg]);
    expect(idx.byOdl.get('912230528')).toBe(pos);
    expect(idx.byComuneMatricola.get('ZAGAROLO|202015249888')).toBe(pos);
  });

  it('tiene il positivo anche se inserito DOPO', () => {
    const idx = buildIndice([neg, pos]);
    expect(idx.byOdl.get('912230528')).toBe(pos);
    expect(idx.byComuneMatricola.get('ZAGAROLO|202015249888')).toBe(pos);
  });

  it('segnala il perdente in perdenti (così non riappare come extra)', () => {
    const idx = buildIndice([neg, pos]);
    expect(idx.perdenti.has('neg')).toBe(true);
    expect(idx.perdenti.has('pos')).toBe(false);
  });

  it('agganciaRiga restituisce il vincitore', () => {
    const idx = buildIndice([neg, pos]);
    expect(agganciaRiga({ odl: '912230528', matricola: '' }, idx, 'ZAGAROLO').lavoro).toBe(pos);
  });
});

describe('agganciaRiga: il positivo vince, il negativo perdente NON riaffiora per ODL', () => {
  // Caso reale: contatore con un NEGATIVO che porta l'ODL ACEA + un POSITIVO manuale SENZA ODL.
  // La riga del master ha l'ODL del negativo: senza il filtro dei perdenti aggancerebbe il "No"
  // e il positivo finirebbe in conflitto (doppio lavoro).
  const neg = { id: 'neg', odl: '912231635', matricola: '20121386035', comune: 'ZAGAROLO', esitoOk: false, data_esecuzione: '2026-06-23', manuale: false };
  const pos = { id: 'pos', odl: null, matricola: '20121386035', comune: 'ZAGAROLO', esitoOk: true, data_esecuzione: '2026-07-02', manuale: true };
  const idx = buildIndice([neg, pos]);

  it('il negativo con ODL è marcato perdente (il positivo ha vinto la chiave matricola)', () => {
    expect(idx.perdenti.has('neg')).toBe(true);
    expect(idx.byComuneMatricola.get('ZAGAROLO|20121386035')).toBe(pos);
  });

  it('la riga con l’ODL del negativo aggancia il POSITIVO (per matricola), non il "No"', () => {
    const hit = agganciaRiga({ odl: '912231635', matricola: '20121386035' }, idx, 'ZAGAROLO');
    expect(hit.lavoro).toBe(pos);
    expect(hit.via).toBe('matricola');
  });

  it('un negativo NON perdente (nessun positivo sul contatore) resta agganciabile per ODL', () => {
    const solo = { id: 'solo', odl: '912231834', matricola: '202015213476', comune: 'ZAGAROLO', esitoOk: false, data_esecuzione: '2026-06-04', manuale: true };
    const idx2 = buildIndice([solo]);
    const hit = agganciaRiga({ odl: '912231834', matricola: '202015213476' }, idx2, 'ZAGAROLO');
    expect(hit.lavoro).toBe(solo);
    expect(hit.via).toBe('odl');
  });
});
