import { describe, it, expect } from 'vitest';
import { aggregaConteggiKpi, VOCE_KPI } from './kpiAggregation';

describe('VOCE_KPI', () => {
  it('mappa le 4 voci ai KPI Acea', () => {
    expect(VOCE_KPI).toEqual({ 10: 'EL', 11: 'ES', 12: 'ERC', 6: 'ERA' });
  });
});

describe('aggregaConteggiKpi', () => {
  it('conta eseguiti positivi, accessi a vuoto e dovuti (annullati esclusi)', () => {
    const interventi = [
      { voce: 11, esito: 'eseguito_positivo', stato: 'completato' },
      { voce: 11, esito: 'accesso_a_vuoto', stato: 'completato' },
      { voce: 11, esito: 'accesso_negato', stato: 'completato' },
      { voce: 11, esito: null, stato: 'assegnato' },
      { voce: 11, esito: null, stato: 'annullato' }, // non dovuto → escluso
    ];
    const es = aggregaConteggiKpi(interventi).find((x) => x.code === 'ES')!;
    expect(es).toEqual({ code: 'ES', eseguitiPositivi: 1, accessiAVuoto: 1, assegnatiDovuti: 4 });
  });

  it('ritorna sempre i 4 KPI nell ordine EL, ES, ERC, ERA', () => {
    expect(aggregaConteggiKpi([]).map((x) => x.code)).toEqual(['EL', 'ES', 'ERC', 'ERA']);
  });

  it('ignora le voci non mappate', () => {
    const r = aggregaConteggiKpi([{ voce: 99, esito: 'eseguito_positivo', stato: 'completato' }]);
    expect(r.every((x) => x.assegnatiDovuti === 0)).toBe(true);
  });

  it('instrada le voci 6/10/12 ai KPI ERA/EL/ERC', () => {
    const r = aggregaConteggiKpi([
      { voce: 6, esito: 'eseguito_positivo', stato: 'completato' },
      { voce: 10, esito: 'eseguito_positivo', stato: 'completato' },
      { voce: 12, esito: 'eseguito_positivo', stato: 'completato' },
    ]);
    expect(r.find((x) => x.code === 'ERA')!.eseguitiPositivi).toBe(1);
    expect(r.find((x) => x.code === 'EL')!.eseguitiPositivi).toBe(1);
    expect(r.find((x) => x.code === 'ERC')!.eseguitiPositivi).toBe(1);
  });
});
