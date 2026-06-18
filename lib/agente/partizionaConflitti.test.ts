import { describe, it, expect } from 'vitest';
import { partizionaConflitti } from './partizionaConflitti';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

const operatori = [
  { staff_id: 's1', staff_name: 'CIARALLO' },
  { staff_id: 's2', staff_name: 'PASTORELLI' },
];

describe('partizionaConflitti', () => {
  it('nessun rapportino esistente -> tutti liberi', () => {
    const r = partizionaConflitti({ operatori, data: '2026-06-19', comune: 'ZAGAROLO', esistenti: [] });
    expect(r.liberi.map((o) => o.staff_id)).toEqual(['s1', 's2']);
    expect(r.inConflitto).toEqual([]);
  });

  it('operatore gia pianificato stesso giorno+comune -> in conflitto, l altro resta libero', () => {
    const esistenti: RapEsistente[] = [
      { id: 'r1', staff_id: 's1', piano_id: 'p9', territorio: 'ZAGAROLO', data: '2026-06-19', stato: 'in_corso', submitted_at: null },
    ];
    const r = partizionaConflitti({ operatori, data: '2026-06-19', comune: 'ZAGAROLO', esistenti });
    expect(r.liberi.map((o) => o.staff_id)).toEqual(['s2']);
    expect(r.inConflitto.map((c) => c.staff_id)).toEqual(['s1']);
  });

  it('comune diverso -> nessun conflitto', () => {
    const esistenti: RapEsistente[] = [
      { id: 'r1', staff_id: 's1', piano_id: 'p9', territorio: 'TIVOLI', data: '2026-06-19', stato: 'in_corso', submitted_at: null },
    ];
    const r = partizionaConflitti({ operatori, data: '2026-06-19', comune: 'ZAGAROLO', esistenti });
    expect(r.inConflitto).toEqual([]);
    expect(r.liberi.map((o) => o.staff_id)).toEqual(['s1', 's2']);
  });
});
