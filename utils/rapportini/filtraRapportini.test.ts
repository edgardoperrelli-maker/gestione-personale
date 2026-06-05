// utils/rapportini/filtraRapportini.test.ts
import { describe, it, expect } from 'vitest';
import { filtraRapportini, type FiltriRiepilogo } from './filtraRapportini';
import type { RapRiepilogo } from './groupByDay';

function rap(p: Partial<RapRiepilogo>): RapRiepilogo {
  return {
    id: 'r', staff_id: 's', staff_name: 'Mario Rossi', token: 't', stato: 'in_corso',
    data: '2026-06-04', expires_at: '', submitted_at: null, url: '',
    statoCalcolato: 'valido', nVoci: 0, piano_id: 'p1', territorio: 'CORCIANO', ...p,
  };
}
const vuoto: FiltriRiepilogo = { territorio: '', operatore: '', stati: [], q: '' };

describe('filtraRapportini', () => {
  it('filtri vuoti → tutto invariato', () => {
    const list = [rap({ id: 'a' }), rap({ id: 'b' })];
    expect(filtraRapportini(list, vuoto)).toHaveLength(2);
  });
  it('filtra per territorio (case-insensitive)', () => {
    const list = [rap({ id: 'a', territorio: 'CORCIANO' }), rap({ id: 'b', territorio: 'ALFA' })];
    expect(filtraRapportini(list, { ...vuoto, territorio: 'corciano' }).map((r) => r.id)).toEqual(['a']);
  });
  it('filtra per stato calcolato', () => {
    const list = [rap({ id: 'a', statoCalcolato: 'inviato' }), rap({ id: 'b', statoCalcolato: 'valido' })];
    expect(filtraRapportini(list, { ...vuoto, stati: ['inviato'] }).map((r) => r.id)).toEqual(['a']);
  });
  it('ricerca testuale su nome operatore', () => {
    const list = [rap({ id: 'a', staff_name: 'Anna Bianchi' }), rap({ id: 'b', staff_name: 'Mario Rossi' })];
    expect(filtraRapportini(list, { ...vuoto, q: 'bianchi' }).map((r) => r.id)).toEqual(['a']);
  });
});
