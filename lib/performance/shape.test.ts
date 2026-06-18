import { describe, it, expect } from 'vitest';
import {
  formatItDate,
  normalizeMacroAttivita,
  filterRows,
  totali,
  buildConfronto,
  buildDistribuzioni,
  buildGiornaliera,
  buildDettaglio,
  emptyFilters,
  type ClientRow,
} from './shape';

const rows: ClientRow[] = [
  { id: 'a', staffId: 's1', operatore: 'Rossi Mario', data: '2026-06-04', territorioId: 't1', territorio: 'Firenze', committente: 'acea', intervento_tipo: 'LIMITAZIONI MASSIVE', valvola: true, esito: 'eseguito_positivo' },
  { id: 'b', staffId: 's1', operatore: 'Rossi Mario', data: '2026-06-04', territorioId: 't1', territorio: 'Firenze', committente: 'acea', intervento_tipo: 'BONIFICHE EXTRA', valvola: false, esito: '' },
  { id: 'c', staffId: 's2', operatore: 'Bianchi Anna', data: '2026-06-05', territorioId: 't2', territorio: 'Lazio Centro', committente: 'lim_massive', intervento_tipo: 'Limitazione massiva', valvola: false, esito: '' },
];

describe('date + macro', () => {
  it('formatItDate', () => expect(formatItDate('2026-03-05')).toBe('05/03/2026'));
  it('normalizeMacroAttivita raggruppa il free-text', () => {
    expect(normalizeMacroAttivita('LIMITAZIONI MASSIVE')).toBe('Limitazioni');
    expect(normalizeMacroAttivita('Limitazione massiva')).toBe('Limitazioni');
    expect(normalizeMacroAttivita('BONIFICHE EXTRA')).toBe('Bonifiche');
    expect(normalizeMacroAttivita('S-PR-003 A Sonda')).toBe('Sostituzioni / sonde');
    expect(normalizeMacroAttivita('')).toBe('Non specificato');
  });
});

describe('filterRows', () => {
  it('range date inclusivo', () => {
    expect(filterRows(rows, { ...emptyFilters('2026-06-05', '2026-06-05') }).length).toBe(1);
  });
  it('operatore / committente / territorio / macro / saracinesca', () => {
    expect(filterRows(rows, { ...emptyFilters(), staffId: 's1' }).length).toBe(2);
    expect(filterRows(rows, { ...emptyFilters(), committente: 'acea' }).length).toBe(2);
    expect(filterRows(rows, { ...emptyFilters(), territorioId: 't2' }).length).toBe(1);
    expect(filterRows(rows, { ...emptyFilters(), macro: 'Bonifiche' }).length).toBe(1);
    expect(filterRows(rows, { ...emptyFilters(), soloValvola: true }).length).toBe(1);
  });
});

describe('totali e saracinesca (no doppio conteggio)', () => {
  it('totale = righe, valvole = solo con saracinesca', () => {
    const t = totali(rows);
    expect(t.totale).toBe(3);
    expect(t.valvole).toBe(1);
  });
});

describe('buildConfronto', () => {
  it('per operatore, ordinato desc, valvole e macro', () => {
    const out = buildConfronto(rows);
    expect(out[0].name).toBe('Rossi Mario');
    expect(out[0].total).toBe(2);
    expect(out[0].valvole).toBe(1);
    expect(out[0].byMacro['Limitazioni']).toBe(1);
    expect(out[0].byMacro['Bonifiche']).toBe(1);
  });
});

describe('buildDistribuzioni', () => {
  it('macro/committente/territorio', () => {
    const d = buildDistribuzioni(rows);
    expect(d.perCommittente.find((s) => s.chiave === 'acea')?.n).toBe(2);
    expect(d.perTerritorio.find((s) => s.chiave === 'Firenze')?.n).toBe(2);
    expect(d.perMacro.find((s) => s.chiave === 'Limitazioni')?.n).toBe(2);
  });
});

describe('buildGiornaliera', () => {
  it('colonne per giorno con conteggi per macro, ordinate', () => {
    const { data, macros } = buildGiornaliera(rows);
    expect(data.length).toBe(2); // 04 e 05 giugno
    expect(data[0].giorno).toBe('2026-06-04');
    expect(data[0].label).toBe('04/06');
    expect(data[0].total).toBe(2);
    expect(macros).toContain('Limitazioni');
    expect(Number(data[0]['Limitazioni'])).toBe(1);
  });
});

describe('buildDettaglio', () => {
  it('righe ordinate per data desc con flag valvola', () => {
    const out = buildDettaglio(rows);
    expect(out[0].giorno).toBe('2026-06-05');
    expect(out.find((r) => r.id === 'a')?.valvola).toBe(true);
  });
});
