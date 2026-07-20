// Test dell'invariante "ODL positivo = definitivamente chiuso".
import { describe, it, expect } from 'vitest';
import {
  normOdl,
  vocePositiva,
  setOdl,
  chiavePositivo,
  indicizzaPositivi,
  dataIt,
  decidiChiusuraConPositivi,
  taskDaSaltare,
} from './odlPositivi';

describe('normOdl / setOdl', () => {
  it('trim + lowercase, i vuoti spariscono', () => {
    expect(normOdl('  ODL9 ')).toBe('odl9');
    expect(normOdl(null)).toBe('');
    expect([...setOdl(['A1', ' a1 ', '', null, 'B2'])].sort()).toEqual(['a1', 'b2']);
  });
});

describe('vocePositiva', () => {
  it('riconosce i SI (varianti) e rifiuta NO/vuoto/testo libero', () => {
    expect(vocePositiva({ eseguito: 'SI' })).toBe(true);
    expect(vocePositiva({ eseguito: 'sì' })).toBe(true);
    expect(vocePositiva({ eseguito: 'NO' })).toBe(false);
    expect(vocePositiva({ eseguito: 'NESSUN PASSAGGIO' })).toBe(false);
    expect(vocePositiva({})).toBe(false);
    expect(vocePositiva(null)).toBe(false);
  });
});

describe('indicizzaPositivi', () => {
  it('tiene il più vecchio per data come originale', () => {
    const m = indicizzaPositivi([
      { id: 'b', odl: 'X', data: '2026-07-15' },
      { id: 'a', odl: 'X', data: '2026-07-14' },
      { id: 'c', odl: 'X', data: '2026-07-16' },
    ]);
    expect(m.get(chiavePositivo('acea', 'X'))).toEqual({ id: 'a', data: '2026-07-14' });
  });

  it('a parità di data vince l\'id minore (determinismo)', () => {
    const m = indicizzaPositivi([
      { id: 'z', odl: 'X', data: '2026-07-14' },
      { id: 'a', odl: 'X', data: '2026-07-14' },
    ]);
    expect(m.get(chiavePositivo('acea', 'X'))?.id).toBe('a');
  });

  it('committenti diversi non si mischiano; odl vuoti ignorati', () => {
    const m = indicizzaPositivi([
      { id: 'a', odl: 'X', data: '2026-07-14', committente: 'acea' },
      { id: 'b', odl: 'X', data: '2026-07-10', committente: 'italgas' },
      { id: 'c', odl: '', data: '2026-07-10' },
    ]);
    expect(m.get(chiavePositivo('acea', 'X'))?.id).toBe('a');
    expect(m.get(chiavePositivo('italgas', 'X'))?.id).toBe('b');
    expect(m.size).toBe(2);
  });
});

describe('dataIt', () => {
  it('converte ISO in DD/MM/YYYY, robusto agli input sporchi', () => {
    expect(dataIt('2026-07-14')).toBe('14/07/2026');
    expect(dataIt(null)).toBe('—');
    expect(dataIt('boh')).toBe('boh');
  });
});

describe('decidiChiusuraConPositivi', () => {
  it('nessun positivo altrove → chiusura normale', () => {
    expect(decidiChiusuraConPositivi({ interventoId: 'i1', esitoPositivo: true, originale: null }))
      .toEqual({ tipo: 'normale' });
  });

  it('il positivo esistente è QUESTO intervento (re-invio) → normale', () => {
    expect(
      decidiChiusuraConPositivi({ interventoId: 'i1', esitoPositivo: true, originale: { id: 'i1', data: '2026-07-14' } }),
    ).toEqual({ tipo: 'normale' });
  });

  it('nuovo POSITIVO con positivo altrove → annulla + da_riconciliare con motivo', () => {
    const d = decidiChiusuraConPositivi({
      interventoId: 'i2', esitoPositivo: true, originale: { id: 'i1', data: '2026-07-14' },
    });
    expect(d.tipo).toBe('annulla_doppio_positivo');
    if (d.tipo === 'annulla_doppio_positivo') {
      expect(d.rifId).toBe('i1');
      expect(d.motivo).toContain('14/07/2026');
    }
  });

  it('NEGATIVO con positivo altrove → chiude ma marca da_riconciliare', () => {
    const d = decidiChiusuraConPositivi({
      interventoId: 'i2', esitoPositivo: false, originale: { id: 'i1', data: '2026-07-14' },
    });
    expect(d).toEqual({ tipo: 'chiudi_e_riconcilia', rifId: 'i1' });
  });
});

describe('taskDaSaltare', () => {
  const nessunaCompilata = () => false;

  it('salta i task il cui ODL ha già un positivo altrove', () => {
    const r = taskDaSaltare({
      tasks: [{ id: 't1', odl: 'A1' }, { id: 't2', odl: 'B2' }],
      odlGiaPositivi: new Set(['a1']),
      vistiOdl: new Set(),
      voceCompilata: nessunaCompilata,
    });
    expect([...r.salta]).toEqual(['t1']);
    expect(r.odlBloccati).toEqual(['A1']);
  });

  it('dedup stesso piano: il secondo task con lo stesso ODL non genera voce', () => {
    const r = taskDaSaltare({
      tasks: [{ id: 'row-35', odl: 'X' }, { id: 'tpl-1-0', odl: 'X' }],
      odlGiaPositivi: new Set(),
      vistiOdl: new Set(),
      voceCompilata: nessunaCompilata,
    });
    expect([...r.salta]).toEqual(['tpl-1-0']);
  });

  it('dedup tra OPERATORI diversi tramite vistiOdl condiviso', () => {
    const visti = new Set<string>();
    const r1 = taskDaSaltare({
      tasks: [{ id: 'a1', odl: 'X' }], odlGiaPositivi: new Set(), vistiOdl: visti, voceCompilata: nessunaCompilata,
    });
    const r2 = taskDaSaltare({
      tasks: [{ id: 'b1', odl: 'X' }], odlGiaPositivi: new Set(), vistiOdl: visti, voceCompilata: nessunaCompilata,
    });
    expect(r1.salta.size).toBe(0);
    expect([...r2.salta]).toEqual(['b1']);
  });

  it('una voce già compilata non si salta MAI (rigenerazione piano storico)', () => {
    const r = taskDaSaltare({
      tasks: [{ id: 't1', odl: 'A1' }],
      odlGiaPositivi: new Set(['a1']),
      vistiOdl: new Set(),
      voceCompilata: (id) => id === 't1',
    });
    expect(r.salta.size).toBe(0);
    expect(r.odlBloccati).toEqual([]);
  });

  it('la compilata reclama l\'ODL anche se viene DOPO nel piano: la non compilata sparisce', () => {
    const r = taskDaSaltare({
      tasks: [{ id: 'vuota', odl: 'X' }, { id: 'compilata', odl: 'X' }],
      odlGiaPositivi: new Set(),
      vistiOdl: new Set(),
      voceCompilata: (id) => id === 'compilata',
    });
    expect([...r.salta]).toEqual(['vuota']);
  });

  it('task senza ODL non vengono mai toccati', () => {
    const r = taskDaSaltare({
      tasks: [{ id: 't1', odl: '' }, { id: 't2', odl: null }, { id: 't3' }],
      odlGiaPositivi: new Set(),
      vistiOdl: new Set(),
      voceCompilata: nessunaCompilata,
    });
    expect(r.salta.size).toBe(0);
  });
});
