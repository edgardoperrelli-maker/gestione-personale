import { describe, expect, it } from 'vitest';
import { lunediSettimana, giorniSettimana } from './settimana';

describe('lunediSettimana', () => {
  it('un lunedì restituisce se stesso', () => {
    expect(lunediSettimana('2026-06-01')).toBe('2026-06-01'); // 2026-06-01 è lunedì
  });

  it('un giorno infrasettimanale torna al lunedì della stessa settimana', () => {
    expect(lunediSettimana('2026-06-03')).toBe('2026-06-01'); // mercoledì
  });

  it('la domenica torna al lunedì precedente (6 giorni indietro)', () => {
    expect(lunediSettimana('2026-06-07')).toBe('2026-06-01');
  });
});

describe('giorniSettimana', () => {
  it('restituisce i 7 giorni da lunedì a domenica', () => {
    expect(giorniSettimana('2026-06-01')).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07',
    ]);
  });

  it('attraversa correttamente il cambio mese', () => {
    expect(giorniSettimana('2026-06-29')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });
});
