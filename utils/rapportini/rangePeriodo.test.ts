// utils/rapportini/rangePeriodo.test.ts
import { describe, it, expect } from 'vitest';
import { calcolaRange, PERIODI } from './rangePeriodo';

describe('calcolaRange', () => {
  const oggi = '2026-06-05';
  it('preset 30 giorni: from = oggi-30, to = oggi+14 (UTC)', () => {
    expect(calcolaRange('30', { dataDa: '', dataA: '' }, oggi)).toEqual({ from: '2026-05-06', to: '2026-06-19' });
  });
  it('preset 7 giorni', () => {
    expect(calcolaRange('7', { dataDa: '', dataA: '' }, oggi)).toEqual({ from: '2026-05-29', to: '2026-06-19' });
  });
  it('preset sconosciuto → default 30', () => {
    expect(calcolaRange('xyz', { dataDa: '', dataA: '' }, oggi)).toEqual({ from: '2026-05-06', to: '2026-06-19' });
  });
  it('custom valido → date esatte', () => {
    expect(calcolaRange('custom', { dataDa: '2026-01-01', dataA: '2026-01-31' }, oggi)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
  it('custom incompleto → null', () => {
    expect(calcolaRange('custom', { dataDa: '2026-01-01', dataA: '' }, oggi)).toBeNull();
    expect(calcolaRange('custom', { dataDa: '', dataA: '2026-01-31' }, oggi)).toBeNull();
  });
  it('custom invertito (Da > A) → null', () => {
    expect(calcolaRange('custom', { dataDa: '2026-02-01', dataA: '2026-01-01' }, oggi)).toBeNull();
  });
  it('PERIODI espone i tre preset', () => {
    expect(PERIODI.map((p) => p.k)).toEqual(['7', '30', '90']);
  });
});
