import { describe, it, expect } from 'vitest';
import { partiRoma } from './orarioRoma';

describe('partiRoma', () => {
  it('estrae oggi/oraCorrente/weekday in fuso Europe/Rome (ora legale, +2)', () => {
    // 2026-06-16 19:30 UTC === 21:30 a Roma (CEST)
    const r = partiRoma(new Date('2026-06-16T19:30:00Z'));
    expect(r.oggi).toBe('2026-06-16');
    expect(r.oraCorrente).toBe('21:30');
    expect(r.weekday).toBe(2); // martedì
  });

  it('rolla la data al giorno dopo a Roma quando a UTC è ancora il giorno prima', () => {
    // 2026-06-16 23:30 UTC === 2026-06-17 01:30 a Roma
    const r = partiRoma(new Date('2026-06-16T23:30:00Z'));
    expect(r.oggi).toBe('2026-06-17');
    expect(r.oraCorrente).toBe('01:30');
    expect(r.weekday).toBe(3); // mercoledì
  });

  it('ora solare (inverno, +1): 2026-01-15 12:00 UTC === 13:00 a Roma', () => {
    const r = partiRoma(new Date('2026-01-15T12:00:00Z'));
    expect(r.oggi).toBe('2026-01-15');
    expect(r.oraCorrente).toBe('13:00');
    expect(r.weekday).toBe(4); // giovedì
  });

  it('domenica ISO = 7', () => {
    // 2026-06-21 è domenica
    const r = partiRoma(new Date('2026-06-21T10:00:00Z'));
    expect(r.weekday).toBe(7);
  });

  it('lunedì ISO = 1', () => {
    // 2026-06-15 è lunedì
    const r = partiRoma(new Date('2026-06-15T10:00:00Z'));
    expect(r.weekday).toBe(1);
  });

  it('oraCorrente zero-pad su ore/minuti a una cifra', () => {
    // 2026-06-16 06:05 UTC === 08:05 a Roma (CEST)
    const r = partiRoma(new Date('2026-06-16T06:05:00Z'));
    expect(r.oraCorrente).toBe('08:05');
  });
});
