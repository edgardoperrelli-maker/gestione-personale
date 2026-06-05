// utils/rapportini/rilevaConflitti.test.ts
import { describe, it, expect } from 'vitest';
import { rilevaConflitti } from './rilevaConflitti';

const base = {
  pianoId: 'pNew', territorio: 'CORCIANO', data: '2026-06-04',
  operatori: [{ staff_id: 's1', staff_name: 'A' }, { staff_id: 's2', staff_name: 'B' }],
};

describe('rilevaConflitti', () => {
  it('conflitto cross-piano stesso territorio/data/operatore', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [{ id: 'r1', staff_id: 's1', piano_id: 'pOld', territorio: 'corciano ', data: '2026-06-04', stato: 'in_corso', submitted_at: null }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ staff_id: 's1', piano_id_esistente: 'pOld', submitted: false });
  });
  it('ignora rapportini dello stesso piano', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [{ id: 'r1', staff_id: 's1', piano_id: 'pNew', territorio: 'CORCIANO', data: '2026-06-04', stato: 'in_corso', submitted_at: null }],
    });
    expect(out).toEqual([]);
  });
  it('ignora territorio diverso e data diversa', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [
        { id: 'r1', staff_id: 's1', piano_id: 'pOld', territorio: 'ALFA', data: '2026-06-04', stato: 'in_corso', submitted_at: null },
        { id: 'r2', staff_id: 's2', piano_id: 'pOld', territorio: 'CORCIANO', data: '2026-06-03', stato: 'in_corso', submitted_at: null },
      ],
    });
    expect(out).toEqual([]);
  });
  it('territorio del piano corrente null → nessun conflitto', () => {
    const out = rilevaConflitti({
      ...base, territorio: null,
      esistenti: [{ id: 'r1', staff_id: 's1', piano_id: 'pOld', territorio: null, data: '2026-06-04', stato: 'in_corso', submitted_at: null }],
    });
    expect(out).toEqual([]);
  });
  it('submitted=true se inviato o submitted_at valorizzato', () => {
    const out = rilevaConflitti({
      ...base,
      esistenti: [{ id: 'r1', staff_id: 's2', piano_id: 'pOld', territorio: 'CORCIANO', data: '2026-06-04', stato: 'inviato', submitted_at: null }],
    });
    expect(out[0].submitted).toBe(true);
  });
});
