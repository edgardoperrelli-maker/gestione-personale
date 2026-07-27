import { describe, it, expect } from 'vitest';
import {
  parseCollapsed,
  chiaveTerritorio,
  potaChiavi,
  isoMeno,
  ASSENZE_APERTE_KEY,
  WEEKEND_APERTO_KEY,
  SENZA_TERRITORIO,
  MAGAZZINO,
} from './cronoCollapse';

describe('parseCollapsed', () => {
  it('null → []', () => expect(parseCollapsed(null)).toEqual([]));
  it('JSON malformato → []', () => expect(parseCollapsed('{bad')).toEqual([]));
  it('oggetto non-array → []', () => expect(parseCollapsed('{"a":1}')).toEqual([]));
  it('array valido → stesso', () => expect(parseCollapsed('["a","b"]')).toEqual(['a', 'b']));
  it('array misto → solo stringhe', () => expect(parseCollapsed('["a",1,null,"b"]')).toEqual(['a', 'b']));
});

describe('chiaveTerritorio', () => {
  const terr = '3827ba56-6551-4dc2-a09e-79667e6c21a2';

  it('lega la corsia al giorno', () =>
    expect(chiaveTerritorio('2026-07-28', terr)).toBe(`2026-07-28|${terr}`));

  it('lo STESSO territorio in due giorni dà due chiavi diverse', () =>
    expect(chiaveTerritorio('2026-07-28', terr)).not.toBe(chiaveTerritorio('2026-07-29', terr)));

  it('due territori nello stesso giorno danno due chiavi diverse', () =>
    expect(chiaveTerritorio('2026-07-28', terr)).not.toBe(chiaveTerritorio('2026-07-28', 'altro')));

  it('territorio assente → corsia «senza territorio»', () =>
    expect(chiaveTerritorio('2026-07-28', null)).toBe(`2026-07-28|${SENZA_TERRITORIO}`));

  it('il magazzino è una corsia come le altre', () =>
    expect(chiaveTerritorio('2026-07-28', MAGAZZINO)).toBe(`2026-07-28|${MAGAZZINO}`));
});

describe('potaChiavi', () => {
  it('tiene le corsie dal giorno di taglio in poi', () => {
    const keys = ['2026-05-01|t1', '2026-07-28|t1', '2026-12-31|t2'];
    expect(potaChiavi(keys, '2026-07-01')).toEqual(['2026-07-28|t1', '2026-12-31|t2']);
  });

  it('il giorno di taglio è compreso', () =>
    expect(potaChiavi(['2026-07-01|t1'], '2026-07-01')).toEqual(['2026-07-01|t1']));

  it('scarta il formato vecchio (solo id territorio, valeva su tutta la settimana)', () =>
    expect(potaChiavi(['3827ba56-6551-4dc2-a09e-79667e6c21a2', '__none__'], '2026-07-01')).toEqual([]));

  it('le chiavi riservate restano: sono preferenze di vista, non di giornata', () => {
    const keys = [ASSENZE_APERTE_KEY, WEEKEND_APERTO_KEY, '2000-01-01|t1'];
    expect(potaChiavi(keys, '2026-07-01')).toEqual([ASSENZE_APERTE_KEY, WEEKEND_APERTO_KEY]);
  });

  it('lista vuota → vuota', () => expect(potaChiavi([], '2026-07-01')).toEqual([]));
});

describe('isoMeno', () => {
  it('scala i giorni', () => expect(isoMeno('2026-07-28', 60)).toBe('2026-05-29'));
  it('attraversa il capodanno', () => expect(isoMeno('2026-01-05', 10)).toBe('2025-12-26'));
  it('gestisce il 29 febbraio bisestile', () => expect(isoMeno('2024-03-01', 1)).toBe('2024-02-29'));
  it('zero giorni → stessa data', () => expect(isoMeno('2026-07-28', 0)).toBe('2026-07-28'));
  it('data non valida → invariata', () => expect(isoMeno('non-una-data', 60)).toBe('non-una-data'));
});
