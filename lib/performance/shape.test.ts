import { describe, it, expect } from 'vitest';
import {
  formatItDate,
  pickGranularity,
  periodKey,
  normalizeMacroAttivita,
  aggregatePerformance,
  type RawIntervento,
} from './shape';

describe('date helpers', () => {
  it('formatItDate: ISO -> gg/mm/aaaa', () => {
    expect(formatItDate('2026-03-05')).toBe('05/03/2026');
  });
  it('pickGranularity', () => {
    expect(pickGranularity('2026-05-01', '2026-05-20')).toBe('day');
    expect(pickGranularity('2026-01-01', '2026-04-01')).toBe('week');
    expect(pickGranularity('2025-01-01', '2026-06-01')).toBe('month');
  });
  it('periodKey: day/week(lunedì)/month senza off-by-one', () => {
    expect(periodKey('2026-03-05', 'day')).toBe('2026-03-05');
    expect(periodKey('2026-03-31', 'month')).toBe('2026-03');
    expect(periodKey('2026-03-05', 'week')).toBe('2026-03-02'); // giovedì -> lunedì
    expect(periodKey('2026-03-01', 'week')).toBe('2026-02-23'); // domenica -> lunedì precedente
  });
});

describe('normalizeMacroAttivita', () => {
  it('raggruppa le varianti free-text', () => {
    expect(normalizeMacroAttivita('LIMITAZIONI MASSIVE')).toBe('Limitazioni');
    expect(normalizeMacroAttivita('Limitazione massiva')).toBe('Limitazioni');
    expect(normalizeMacroAttivita('BONIFICHE EXTRA')).toBe('Bonifiche');
    expect(normalizeMacroAttivita('PICARRO')).toBe('Picarro');
    expect(normalizeMacroAttivita('Sospensione fornitura')).toBe('Sospensioni');
    expect(normalizeMacroAttivita('Rimozione misuratore per morosità')).toBe('Morosità / forniture');
    expect(normalizeMacroAttivita('Regolarizzazione flusso idrico')).toBe('Flusso idrico');
    expect(normalizeMacroAttivita('S-PR-003 A Sonda')).toBe('Sostituzioni / sonde');
    expect(normalizeMacroAttivita('')).toBe('Non specificato');
    expect(normalizeMacroAttivita(null)).toBe('Non specificato');
    expect(normalizeMacroAttivita('Qualcosa di strano')).toBe('Altro');
  });
});

describe('aggregatePerformance', () => {
  const staff = new Map<string, string>([['s1', 'Rossi Mario'], ['s2', 'Bianchi Anna']]);
  const terr = new Map<string, string>([['t1', 'Firenze'], ['t2', 'Lazio Centro']]);
  const rows: RawIntervento[] = [
    { id: 'a', staff_id: 's1', data: '2026-05-04', territorio_id: 't1', committente: 'acea', intervento_tipo: 'LIMITAZIONI MASSIVE', esito: 'eseguito_positivo' },
    { id: 'b', staff_id: 's1', data: '2026-05-04', territorio_id: 't1', committente: 'acea', intervento_tipo: 'BONIFICHE EXTRA', esito: null },
    { id: 'c', staff_id: 's2', data: '2026-05-05', territorio_id: 't2', committente: 'lim_massive', intervento_tipo: 'Limitazione massiva', esito: null },
  ];

  it('conta per operatore, ordina desc, split macro', () => {
    const out = aggregatePerformance(rows, staff, terr, { dateFrom: '2026-05-01', dateTo: '2026-05-20' });
    expect(out.totale).toBe(3);
    expect(out.confronto[0].name).toBe('Rossi Mario');
    expect(out.confronto[0].total).toBe(2);
    expect(out.confronto[0].byMacro['Limitazioni']).toBe(1);
    expect(out.confronto[0].byMacro['Bonifiche']).toBe(1);
  });
  it('distribuzioni per macro/committente/territorio', () => {
    const out = aggregatePerformance(rows, staff, terr, { dateFrom: '2026-05-01', dateTo: '2026-05-20' });
    expect(out.perCommittente.find((s) => s.chiave === 'acea')?.n).toBe(2);
    expect(out.perTerritorio.find((s) => s.chiave === 'Firenze')?.n).toBe(2);
    expect(out.perMacro.find((s) => s.chiave === 'Limitazioni')?.n).toBe(2);
  });
  it('filtro macro-attività riduce il set', () => {
    const out = aggregatePerformance(rows, staff, terr, { dateFrom: '2026-05-01', dateTo: '2026-05-20', macroAttivita: 'Bonifiche' });
    expect(out.totale).toBe(1);
    expect(out.confronto[0].id).toBe('s1');
  });
  it('dettaglio per operatore selezionato', () => {
    const out = aggregatePerformance(rows, staff, terr, { dateFrom: '2026-05-01', dateTo: '2026-05-20', selOperator: 's2' });
    expect(out.dettaglio?.name).toBe('Bianchi Anna');
    expect(out.dettaglio?.rows.length).toBe(1);
    expect(out.dettaglio?.rows[0].territorio).toBe('Lazio Centro');
  });
});
