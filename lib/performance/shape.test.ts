import { describe, it, expect } from 'vitest';
import {
  formatItDate,
  labelCommittente,
  labelEsito,
  esitoPositivo,
  filterRows,
  totali,
  buildEsiti,
  buildEsitiOperatori,
  buildConfronto,
  buildDistribuzioni,
  buildGiornaliera,
  buildDettaglio,
  emptyFilters,
  GRUPPO_NON_CENSITO,
  type ClientRow,
} from './shape';

const rows: ClientRow[] = [
  { id: 'a', staffId: 's1', operatore: 'Rossi Mario', data: '2026-06-04', territorioId: 't1', territorio: 'Firenze', committente: 'acea', gruppo: 'LIMITAZIONI', attivita: 'LIMITAZIONI MASSIVE', valvola: true, esito: 'eseguito_positivo' },
  { id: 'b', staffId: 's1', operatore: 'Rossi Mario', data: '2026-06-04', territorioId: 't1', territorio: 'Firenze', committente: 'acea', gruppo: 'BONIFICHE', attivita: 'BONIFICHE EXTRA', valvola: false, esito: 'accesso_negato' },
  { id: 'c', staffId: 's2', operatore: 'Bianchi Anna', data: '2026-06-05', territorioId: 't2', territorio: 'Lazio Centro', committente: 'lim_massive', gruppo: 'LIMITAZIONI', attivita: 'Limitazione massiva', valvola: false, esito: '' },
  { id: 'd', staffId: 's2', operatore: 'Bianchi Anna', data: '2026-06-05', territorioId: 't2', territorio: 'Lazio Centro', committente: 'italgas', gruppo: GRUPPO_NON_CENSITO, attivita: 'ATTIVITA MISTERIOSA', valvola: false, esito: 'eseguito_positivo' },
];

describe('date + etichette', () => {
  it('formatItDate', () => expect(formatItDate('2026-03-05')).toBe('05/03/2026'));
  it('labelCommittente', () => {
    expect(labelCommittente('acea')).toBe('Acea');
    expect(labelCommittente('lim_massive')).toBe('Acea · lim. massive');
    expect(labelCommittente('sconosciuto_xyz')).toBe('sconosciuto_xyz');
    expect(labelCommittente('')).toBe('—');
  });
  it('labelEsito', () => {
    expect(labelEsito('eseguito_positivo')).toBe('Eseguito positivo');
    expect(labelEsito('accesso_negato')).toBe('Accesso negato');
    expect(labelEsito('')).toBe('Non eseguito');
  });
});

describe('esitoPositivo', () => {
  it('solo eseguito_positivo è positivo; causali e esito assente sono negativi', () => {
    expect(esitoPositivo({ esito: 'eseguito_positivo' })).toBe(true);
    expect(esitoPositivo({ esito: 'accesso_negato' })).toBe(false);
    expect(esitoPositivo({ esito: '' })).toBe(false);
  });
});

describe('filterRows (multi-selezione)', () => {
  it('range date inclusivo', () => {
    expect(filterRows(rows, { ...emptyFilters('2026-06-05', '2026-06-05') }).length).toBe(2);
  });
  it('array vuoto = tutti; array valorizzato = OR interno', () => {
    expect(filterRows(rows, { ...emptyFilters(), staffIds: ['s1'] }).length).toBe(2);
    expect(filterRows(rows, { ...emptyFilters(), staffIds: ['s1', 's2'] }).length).toBe(4);
    expect(filterRows(rows, { ...emptyFilters(), committenti: ['acea'] }).length).toBe(2);
    expect(filterRows(rows, { ...emptyFilters(), committenti: ['acea', 'lim_massive'] }).length).toBe(3);
    expect(filterRows(rows, { ...emptyFilters(), territorioIds: ['t2'] }).length).toBe(2);
    expect(filterRows(rows, { ...emptyFilters(), gruppi: ['LIMITAZIONI'] }).length).toBe(2);
    expect(filterRows(rows, { ...emptyFilters(), gruppi: [GRUPPO_NON_CENSITO] }).length).toBe(1);
    expect(filterRows(rows, { ...emptyFilters(), attivita: ['BONIFICHE EXTRA'] }).length).toBe(1);
    expect(filterRows(rows, { ...emptyFilters(), soloValvola: true }).length).toBe(1);
  });
  it('AND tra filtri diversi', () => {
    expect(filterRows(rows, { ...emptyFilters(), staffIds: ['s2'], gruppi: ['LIMITAZIONI'] }).length).toBe(1);
  });
});

describe('totali e saracinesca (no doppio conteggio)', () => {
  it('totale = righe, valvole = solo con saracinesca', () => {
    const t = totali(rows);
    expect(t.totale).toBe(4);
    expect(t.valvole).toBe(1);
  });
});

describe('buildEsiti (grafico principale)', () => {
  it('serie giornaliera positivi/negativi ordinata + totali con percentuale', () => {
    const { data, tot } = buildEsiti(rows);
    expect(data.length).toBe(2);
    expect(data[0]).toMatchObject({ giorno: '2026-06-04', label: '04/06', positivi: 1, negativi: 1 });
    expect(data[1]).toMatchObject({ giorno: '2026-06-05', positivi: 1, negativi: 1 });
    expect(tot).toEqual({ positivi: 2, negativi: 2, totale: 4, pct: 50 });
  });
  it('vuoto → pct 0 senza divisioni per zero', () => {
    expect(buildEsiti([]).tot).toEqual({ positivi: 0, negativi: 0, totale: 0, pct: 0 });
  });
});

describe('buildEsitiOperatori', () => {
  it('riepilogo per operatore ordinato per volume', () => {
    const out = buildEsitiOperatori(rows);
    expect(out.length).toBe(2);
    const rossi = out.find((o) => o.id === 's1')!;
    expect(rossi).toMatchObject({ positivi: 1, negativi: 1, totale: 2, pct: 50 });
    const bianchi = out.find((o) => o.id === 's2')!;
    expect(bianchi).toMatchObject({ positivi: 1, negativi: 1, totale: 2, pct: 50 });
  });
});

describe('buildConfronto', () => {
  it('per operatore, ordinato desc, valvole e gruppi reali', () => {
    const out = buildConfronto(rows);
    expect(out[0].total).toBe(2);
    const rossi = out.find((o) => o.id === 's1')!;
    expect(rossi.valvole).toBe(1);
    expect(rossi.byGruppo['LIMITAZIONI']).toBe(1);
    expect(rossi.byGruppo['BONIFICHE']).toBe(1);
  });
});

describe('buildDistribuzioni', () => {
  it('gruppo/committente (etichettato)/territorio', () => {
    const d = buildDistribuzioni(rows);
    expect(d.perGruppo.find((s) => s.chiave === 'LIMITAZIONI')?.n).toBe(2);
    expect(d.perGruppo.find((s) => s.chiave === GRUPPO_NON_CENSITO)?.n).toBe(1);
    expect(d.perCommittente.find((s) => s.chiave === 'Acea')?.n).toBe(2);
    expect(d.perCommittente.find((s) => s.chiave === 'Acea · lim. massive')?.n).toBe(1);
    expect(d.perTerritorio.find((s) => s.chiave === 'Firenze')?.n).toBe(2);
  });
});

describe('buildGiornaliera', () => {
  it('colonne per giorno con conteggi per gruppo reale, ordinate', () => {
    const { data, gruppi } = buildGiornaliera(rows);
    expect(data.length).toBe(2); // 04 e 05 giugno
    expect(data[0].giorno).toBe('2026-06-04');
    expect(data[0].label).toBe('04/06');
    expect(data[0].total).toBe(2);
    expect(gruppi).toContain('LIMITAZIONI');
    expect(Number(data[0]['LIMITAZIONI'])).toBe(1);
  });
});

describe('buildDettaglio', () => {
  it('righe ordinate per data desc, esito etichettato e flag positivo', () => {
    const out = buildDettaglio(rows);
    expect(out[0].giorno).toBe('2026-06-05');
    const a = out.find((r) => r.id === 'a')!;
    expect(a.valvola).toBe(true);
    expect(a.esito).toBe('Eseguito positivo');
    expect(a.positivo).toBe(true);
    const c = out.find((r) => r.id === 'c')!;
    expect(c.esito).toBe('Non eseguito');
    expect(c.positivo).toBe(false);
  });
});
