import { describe, it, expect } from 'vitest';
import { decideEsecuzione, riassumiReport, type ReportAgente } from './decisione';

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

describe('riassumiReport', () => {
  it('somma lavori/aggiornate/extra/conflitti dai file[] + extraNonCollocate', () => {
    const report: ReportAgente = {
      lavori: 12,
      dryRun: false,
      file: [
        { aggiornate: 3, extraAggiunte: 1, conflitti: [{}, {}] },
        { aggiornate: 2, extraAggiunte: 0, conflitti: [{}] },
      ],
      extraNonCollocate: [{}, {}, {}],
    };
    expect(riassumiReport(report)).toEqual({
      lavori: 12,
      aggiornate: 5,
      extra: 1,
      conflitti: 3,
      nonCollocate: 3,
    });
  });

  it('report vuoto → tutti zero', () => {
    expect(riassumiReport({})).toEqual({
      lavori: 0, aggiornate: 0, extra: 0, conflitti: 0, nonCollocate: 0,
    });
  });

  it('campi opzionali mancanti nei file → trattati come 0/[]', () => {
    const report: ReportAgente = { file: [{}, { aggiornate: 4 }] };
    expect(riassumiReport(report)).toEqual({
      lavori: 0, aggiornate: 4, extra: 0, conflitti: 0, nonCollocate: 0,
    });
  });

  it('file assente del tutto → zero', () => {
    expect(riassumiReport({ lavori: 7 })).toEqual({
      lavori: 7, aggiornate: 0, extra: 0, conflitti: 0, nonCollocate: 0,
    });
  });

  it('extraNonCollocate assente → nonCollocate 0', () => {
    const report: ReportAgente = { file: [{ extraAggiunte: 2 }] };
    expect(riassumiReport(report).nonCollocate).toBe(0);
  });
});
