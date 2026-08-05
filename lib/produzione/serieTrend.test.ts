import { describe, expect, it } from 'vitest';
import { serieTrend, raggruppaPerSettimana } from './serieTrend';
import type { Aggregato } from './aggregaProduzione';

const g = (chiave: string, valore: number): Aggregato => ({ chiave, label: chiave, conteggio: 1, valore });

describe('serieTrend', () => {
  it('cumula produzione e SAL per giorno, con scarto clampato a ≥ 0', () => {
    const s = serieTrend(
      [g('2026-06-01', 100), g('2026-06-03', 50)],
      [g('2026-06-01', 30), g('2026-06-02', 40)],
      '2026-06-01',
      '2026-06-30',
    );
    expect(s.map((p) => p.data)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(s[0]).toMatchObject({ prodCum: 100, salCum: 30, scartoCum: 70, prodGiorno: 100 });
    expect(s[1]).toMatchObject({ prodCum: 100, salCum: 70, scartoCum: 30, prodGiorno: 0 });
    expect(s[2]).toMatchObject({ prodCum: 150, salCum: 70, scartoCum: 80, prodGiorno: 50 });
  });

  it('le righe SAL prima di from entrano come offset iniziale', () => {
    const s = serieTrend([g('2026-06-10', 100)], [g('2026-05-01', 25), g('2026-06-10', 5)], '2026-06-01', '2026-06-30');
    expect(s).toHaveLength(1);
    expect(s[0].salCum).toBe(30); // 25 (offset pre-from) + 5
  });

  it('scarto mai negativo (SAL > produzione del periodo)', () => {
    const s = serieTrend([g('2026-06-10', 10)], [g('2026-05-01', 100)], '2026-06-01', '2026-06-30');
    expect(s[0].scartoCum).toBe(0);
  });

  it('date oltre to sono escluse', () => {
    const s = serieTrend([g('2026-06-10', 10), g('2026-07-05', 99)], [], '2026-06-01', '2026-06-30');
    expect(s.map((p) => p.data)).toEqual(['2026-06-10']);
  });
});

describe('raggruppaPerSettimana', () => {
  it('raggruppa per lunedì ISO sommando valore e conteggio', () => {
    // 2026-06-01 è lunedì; 2026-06-03 mercoledì stessa settimana; 2026-06-08 lunedì successivo
    const out = raggruppaPerSettimana([g('2026-06-01', 10), g('2026-06-03', 5), g('2026-06-08', 7)]);
    expect(out).toEqual([
      { chiave: '2026-06-01', label: '2026-06-01', conteggio: 2, valore: 15 },
      { chiave: '2026-06-08', label: '2026-06-08', conteggio: 1, valore: 7 },
    ]);
  });
});
