import { describe, it, expect } from 'vitest';
import { raggruppaPerPiano, type RigaRisolta } from './raggruppaPerPiano';

const r = (over: Partial<RigaRisolta>): RigaRisolta => ({
  id: 'a', odl: 'O1', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO',
  data: '2026-06-19', staffId: 's1', staffName: 'CIARALLO SIMONE', ...over,
});

describe('raggruppaPerPiano', () => {
  it('un piano per (data,comune); operatori per staffId; un Task per riga', () => {
    const out = raggruppaPerPiano([
      r({ id: '1', staffId: 's1' }),
      r({ id: '2', staffId: 's1' }),
      r({ id: '3', staffId: 's2', staffName: 'PASTORELLI LUIGI' }),
    ], 'LIMITAZIONI MASSIVE');
    expect(out).toHaveLength(1);
    expect(out[0].comune).toBe('ZAGAROLO');
    expect(out[0].operatori).toHaveLength(2);
    const s1 = out[0].operatori.find((o) => o.staffId === 's1')!;
    expect(s1.tasks).toHaveLength(2);
    expect(s1.tasks[0]).toEqual({ id: '1', odl: 'O1', indirizzo: 'VIA X', cap: '', citta: 'ZAGAROLO', priorita: 0, fascia_oraria: '', matricola: 'M1', attivita: 'LIMITAZIONI MASSIVE' });
  });
  it('giorni/comuni diversi → piani separati', () => {
    const out = raggruppaPerPiano([
      r({ id: '1', data: '2026-06-19', comune: 'ZAGAROLO' }),
      r({ id: '2', data: '2026-06-20', comune: 'ZAGAROLO' }),
      r({ id: '3', data: '2026-06-19', comune: 'ROMA' }),
    ], 'X');
    expect(out).toHaveLength(3);
  });
});
