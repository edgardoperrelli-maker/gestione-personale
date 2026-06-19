import { describe, it, expect } from 'vitest';
import { ordinaGiorni, etichettaRelativaGiorno } from './giorniRiepilogo';

describe('ordinaGiorni', () => {
  it('ordina in decrescente: futuri/recenti in cima (no sandwich tra oggi e ieri)', () => {
    const giorni = ['2026-06-16', '2026-06-20', '2026-06-18', '2026-06-19', '2026-06-17'];
    expect(ordinaGiorni(giorni, '2026-06-18')).toEqual([
      '2026-06-20', '2026-06-19', '2026-06-18', '2026-06-17', '2026-06-16',
    ]);
  });
  it('funziona se oggi non è tra i giorni (solo futuri/passati)', () => {
    expect(ordinaGiorni(['2026-06-20', '2026-06-15'], '2026-06-18')).toEqual(['2026-06-20', '2026-06-15']);
  });
  it('ritorna [] su input vuoto', () => {
    expect(ordinaGiorni([], '2026-06-18')).toEqual([]);
  });
});

describe('etichettaRelativaGiorno', () => {
  it('riconosce oggi/domani/ieri e altrimenti null', () => {
    expect(etichettaRelativaGiorno('2026-06-18', '2026-06-18')).toBe('oggi');
    expect(etichettaRelativaGiorno('2026-06-19', '2026-06-18')).toBe('domani');
    expect(etichettaRelativaGiorno('2026-06-17', '2026-06-18')).toBe('ieri');
    expect(etichettaRelativaGiorno('2026-06-25', '2026-06-18')).toBeNull();
  });
});
