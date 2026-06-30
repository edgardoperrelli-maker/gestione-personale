import { describe, expect, it } from 'vitest';
import { prezzoPerData, valoreRiga, type ListinoRiga } from './valorizza';

const r = (over: Partial<ListinoRiga>): ListinoRiga => ({
  id: 'x',
  voce: 10,
  prezzo: 0,
  valido_dal: '2026-01-01',
  valido_al: null,
  attivo: true,
  ...over,
});

describe('prezzoPerData', () => {
  it('ritorna prezzo+id della riga aperta che copre la data', () => {
    const listino = [r({ id: 'a', voce: 10, prezzo: 12.5, valido_dal: '2026-01-01', valido_al: null })];
    expect(prezzoPerData(listino, 10, '2026-06-15')).toEqual({ prezzo: 12.5, listinoId: 'a' });
  });

  it('è inclusivo ai bordi del periodo (valido_dal e valido_al compresi)', () => {
    const listino = [r({ id: 'a', prezzo: 9, valido_dal: '2026-01-01', valido_al: '2026-06-30' })];
    expect(prezzoPerData(listino, 10, '2026-01-01')?.prezzo).toBe(9);
    expect(prezzoPerData(listino, 10, '2026-06-30')?.prezzo).toBe(9);
  });

  it('ritorna null fuori dal periodo (prima o dopo)', () => {
    const listino = [r({ prezzo: 9, valido_dal: '2026-02-01', valido_al: '2026-06-30' })];
    expect(prezzoPerData(listino, 10, '2026-01-31')).toBeNull();
    expect(prezzoPerData(listino, 10, '2026-07-01')).toBeNull();
  });

  it('sceglie il periodo giusto quando la tariffa cambia nel tempo', () => {
    const listino = [
      r({ id: 'q1', prezzo: 10, valido_dal: '2026-01-01', valido_al: '2026-06-30' }),
      r({ id: 'q2', prezzo: 12, valido_dal: '2026-07-01', valido_al: null }),
    ];
    expect(prezzoPerData(listino, 10, '2026-03-10')).toEqual({ prezzo: 10, listinoId: 'q1' });
    expect(prezzoPerData(listino, 10, '2026-08-10')).toEqual({ prezzo: 12, listinoId: 'q2' });
  });

  it('ignora le righe non attive', () => {
    const listino = [r({ id: 'off', prezzo: 99, attivo: false })];
    expect(prezzoPerData(listino, 10, '2026-06-15')).toBeNull();
  });

  it('a parità di voce/data sceglie il valido_dal più recente (deterministico)', () => {
    const listino = [
      r({ id: 'vecchio', prezzo: 10, valido_dal: '2026-01-01', valido_al: null }),
      r({ id: 'nuovo', prezzo: 15, valido_dal: '2026-05-01', valido_al: null }),
    ];
    expect(prezzoPerData(listino, 10, '2026-06-15')).toEqual({ prezzo: 15, listinoId: 'nuovo' });
  });

  it('ritorna null se la voce non è a listino', () => {
    const listino = [r({ voce: 10, prezzo: 12 })];
    expect(prezzoPerData(listino, 11, '2026-06-15')).toBeNull();
  });
});

describe('valoreRiga', () => {
  it('default quantità = 1', () => {
    expect(valoreRiga(89.66)).toBe(89.66);
  });
  it('moltiplica per la quantità e arrotonda a 2 decimali', () => {
    expect(valoreRiga(10, 3)).toBe(30);
    expect(valoreRiga(33.33, 3)).toBe(99.99);
  });
});
