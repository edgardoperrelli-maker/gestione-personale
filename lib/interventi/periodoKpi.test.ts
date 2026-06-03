import { describe, it, expect } from 'vitest';
import { getPeriodoBimestrale } from './periodoKpi';

describe('getPeriodoBimestrale', () => {
  it('giugno → bimestre maggio–giugno', () => {
    expect(getPeriodoBimestrale('2026-06-03')).toEqual({ inizio: '2026-05-01', fine: '2026-06-30' });
  });
  it('mese dispari resta inizio bimestre (maggio)', () => {
    expect(getPeriodoBimestrale('2026-05-20')).toEqual({ inizio: '2026-05-01', fine: '2026-06-30' });
  });
  it('gennaio–febbraio su anno bisestile (29 feb)', () => {
    expect(getPeriodoBimestrale('2024-01-15')).toEqual({ inizio: '2024-01-01', fine: '2024-02-29' });
  });
  it('dicembre → novembre–dicembre', () => {
    expect(getPeriodoBimestrale('2026-12-31')).toEqual({ inizio: '2026-11-01', fine: '2026-12-31' });
  });
});
