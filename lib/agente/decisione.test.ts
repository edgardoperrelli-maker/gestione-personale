import { describe, it, expect } from 'vitest';
import { decideEsecuzione } from './decisione';

const base = {
  enabled: true,
  giorni: [1, 2, 3, 4, 5],
  ora: '21:00',
  weekday: 2,
  oraCorrente: '21:30',
  oggi: '2026-06-16',
  ultimaRivendicazione: null as string | null,
};

describe('decideEsecuzione', () => {
  it('tutte le condizioni vere → true', () => {
    expect(decideEsecuzione(base)).toBe(true);
  });
  it('disabilitato → false', () => {
    expect(decideEsecuzione({ ...base, enabled: false })).toBe(false);
  });
  it('giorno non in elenco → false', () => {
    expect(decideEsecuzione({ ...base, weekday: 6 })).toBe(false);
  });
  it('ora corrente prima dell ora pianificata → false', () => {
    expect(decideEsecuzione({ ...base, oraCorrente: '20:59' })).toBe(false);
  });
  it('ora corrente esattamente uguale all ora → true (>=)', () => {
    expect(decideEsecuzione({ ...base, oraCorrente: '21:00' })).toBe(true);
  });
  it('già rivendicato oggi → false', () => {
    expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-16' })).toBe(false);
  });
  it('rivendicazione di un altro giorno → true', () => {
    expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-15' })).toBe(true);
  });
  it('confronto orario lessicografico zero-pad: 09:30 >= 09:00', () => {
    expect(decideEsecuzione({ ...base, ora: '09:00', oraCorrente: '09:30' })).toBe(true);
  });
});
