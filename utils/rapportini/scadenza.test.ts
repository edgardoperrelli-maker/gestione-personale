import { describe, it, expect } from 'vitest';
import { dataInRoma, addGiorni, mezzanotteRomaIso, isScaduto, scadenzaIso, GIORNI_VALIDITA } from './scadenza';

describe('GIORNI_VALIDITA', () => {
  it('è 2 (48h dalla mezzanotte)', () => { expect(GIORNI_VALIDITA).toBe(2); });
});

describe('dataInRoma', () => {
  it('estate: sera UTC resta stesso giorno se prima di mezzanotte Roma', () => {
    // 21:30Z = 23:30 Roma (UTC+2) dell'8
    expect(dataInRoma('2026-06-08T21:30:00Z')).toBe('2026-06-08');
  });
  it('estate: dopo le 22:00Z è già il giorno dopo a Roma', () => {
    // 22:30Z = 00:30 Roma del 9
    expect(dataInRoma('2026-06-08T22:30:00Z')).toBe('2026-06-09');
  });
  it('inverno: dopo le 23:00Z è già il giorno dopo a Roma', () => {
    // 23:30Z = 00:30 Roma (UTC+1) del 16
    expect(dataInRoma('2026-01-15T23:30:00Z')).toBe('2026-01-16');
  });
});

describe('addGiorni', () => {
  it('somma giorni semplici', () => { expect(addGiorni('2026-06-08', 1)).toBe('2026-06-09'); });
  it('somma due giorni', () => { expect(addGiorni('2026-06-08', 2)).toBe('2026-06-10'); });
  it('attraversa il cambio mese', () => { expect(addGiorni('2026-01-31', 1)).toBe('2026-02-01'); });
  it('attraversa il cambio anno', () => { expect(addGiorni('2026-12-31', 1)).toBe('2027-01-01'); });
  it('attraversa il weekend di ora legale (UTC, niente salti)', () => {
    expect(addGiorni('2026-03-28', 1)).toBe('2026-03-29');
  });
});

describe('mezzanotteRomaIso', () => {
  it('estate (+02:00)', () => { expect(mezzanotteRomaIso('2026-06-10')).toBe('2026-06-09T22:00:00.000Z'); });
  it('inverno (+01:00)', () => { expect(mezzanotteRomaIso('2026-01-17')).toBe('2026-01-16T23:00:00.000Z'); });
});

describe('isScaduto (giorno lavori = lunedì 2026-06-08)', () => {
  const data = '2026-06-08';
  it('il giorno stesso è valido', () => { expect(isScaduto(data, '2026-06-08T08:00:00Z')).toBe(false); });
  it('il giorno dopo è valido', () => { expect(isScaduto(data, '2026-06-09T08:00:00Z')).toBe(false); });
  it('due giorni dopo è scaduto', () => { expect(isScaduto(data, '2026-06-10T08:00:00Z')).toBe(true); });
  it('link generato in anticipo (venerdì prima) è valido', () => { expect(isScaduto(data, '2026-06-05T08:00:00Z')).toBe(false); });
  it('bordo: 23:30 Roma dell\'ultimo giorno valido → valido', () => { expect(isScaduto(data, '2026-06-09T21:30:00Z')).toBe(false); });
  it('bordo: 00:00 Roma del giorno dopo → scaduto', () => { expect(isScaduto(data, '2026-06-09T22:00:00Z')).toBe(true); });
});

describe('isScaduto inverno (giorno lavori = 2026-01-15)', () => {
  const data = '2026-01-15';
  it('bordo: 23:59 Roma dell\'ultimo giorno valido → valido', () => { expect(isScaduto(data, '2026-01-16T22:59:00Z')).toBe(false); });
  it('bordo: 00:00 Roma del giorno dopo → scaduto', () => { expect(isScaduto(data, '2026-01-16T23:00:00Z')).toBe(true); });
});

describe('scadenzaIso', () => {
  it('estate: mezzanotte Roma del giorno lavori + 48h', () => { expect(scadenzaIso('2026-06-08')).toBe('2026-06-09T22:00:00.000Z'); });
  it('inverno: mezzanotte Roma del giorno lavori + 48h', () => { expect(scadenzaIso('2026-01-15')).toBe('2026-01-16T23:00:00.000Z'); });
  it('è coerente con isScaduto (scaduto esattamente all\'istante restituito)', () => {
    const iso = scadenzaIso('2026-06-08');
    expect(isScaduto('2026-06-08', iso)).toBe(true);
    expect(isScaduto('2026-06-08', new Date(Date.parse(iso) - 1000).toISOString())).toBe(false);
  });
});
