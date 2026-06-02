import { describe, it, expect } from 'vitest';
import { aggregateRapportiniKpi, type RapportinoKpiRow } from './rapportiniKpi';

const TODAY = '2026-06-01';

function row(p: Partial<RapportinoKpiRow>): RapportinoKpiRow {
  return { data: TODAY, stato: 'in_corso', statoCalcolato: 'valido', ...p };
}

describe('aggregateRapportiniKpi', () => {
  it('conta gli stati calcolati e il totale', () => {
    const rows = [
      row({ statoCalcolato: 'inviato', stato: 'inviato' }),
      row({ statoCalcolato: 'inviato', stato: 'inviato' }),
      row({ statoCalcolato: 'valido' }),
      row({ statoCalcolato: 'scaduto' }),
    ];
    const kpi = aggregateRapportiniKpi(rows, TODAY);
    expect(kpi.total).toBe(4);
    expect(kpi.inviato).toBe(2);
    expect(kpi.valido).toBe(1);
    expect(kpi.scaduto).toBe(1);
  });

  it('conta i non consegnati: non inviati di giorni passati', () => {
    const rows = [
      row({ data: '2026-05-30', stato: 'in_corso', statoCalcolato: 'scaduto' }), // passato, non inviato → conta
      row({ data: '2026-05-30', stato: 'inviato', statoCalcolato: 'inviato' }), // passato ma inviato → no
      row({ data: TODAY, stato: 'in_corso', statoCalcolato: 'valido' }), // oggi → no
    ];
    const kpi = aggregateRapportiniKpi(rows, TODAY);
    expect(kpi.nonConsegnati).toBe(1);
  });

  it('gestisce elenco vuoto', () => {
    const kpi = aggregateRapportiniKpi([], TODAY);
    expect(kpi).toEqual({ total: 0, inviato: 0, valido: 0, scaduto: 0, nonConsegnati: 0 });
  });
});
