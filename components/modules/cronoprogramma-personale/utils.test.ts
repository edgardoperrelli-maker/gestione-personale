import { describe, it, expect } from 'vitest';
import type { Assignment, Staff } from '@/types';
import {
  writeAssignmentDragData,
  readAssignmentDragData,
  writeDayDragData,
  writeSquadDragData,
  readSquadDragData,
  assignmentActivityIds,
  filterAssignments,
  operatoriInMagazzino,
} from './utils';

/** DataTransfer minimale: registra effectAllowed e il KV di setData/getData. */
function fakeDataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: 'uninitialized' as string,
    dropEffect: 'none' as string,
    setData(type: string, data: string) {
      store[type] = data;
    },
    getData(type: string) {
      return store[type] ?? '';
    },
    get types() {
      return Object.keys(store);
    },
  };
}

describe('writeAssignmentDragData', () => {
  it("usa effectAllowed='all' così il drop 'link' (aggancia squadra) è ammesso", () => {
    // Regressione: con 'copyMove' il browser rifiuta dropEffect='link' e l'evento drop non parte,
    // quindi trascinando una card su un'altra la squadra non si crea mai.
    const dt = fakeDataTransfer();
    writeAssignmentDragData(dt as unknown as DataTransfer, {
      id: 'a1',
      fromDay: '2026-07-13',
      fromTerritoryId: 't1',
    });
    expect(dt.effectAllowed).toBe('all');
  });

  it('round-trip: legge lo stesso payload scritto', () => {
    const dt = fakeDataTransfer();
    writeAssignmentDragData(dt as unknown as DataTransfer, {
      id: 'a1',
      fromDay: '2026-07-13',
      fromTerritoryId: null,
    });
    expect(readAssignmentDragData(dt as unknown as DataTransfer)).toEqual({
      id: 'a1',
      fromDay: '2026-07-13',
      fromTerritoryId: null,
    });
  });
});

describe('writeDayDragData', () => {
  it("resta copy/move (il giorno non si 'aggancia')", () => {
    const dt = fakeDataTransfer();
    writeDayDragData(dt as unknown as DataTransfer, { fromDay: '2026-07-13' });
    expect(dt.effectAllowed).toBe('copyMove');
  });
});

describe('squad drag data (drag della card-squadra come blocco)', () => {
  it("round-trip squadraId+fromDay, effectAllowed='all' (ammette move e copy)", () => {
    const dt = fakeDataTransfer();
    writeSquadDragData(dt as unknown as DataTransfer, { squadraId: 'SQ-1', fromDay: '2026-07-13' });
    expect(dt.effectAllowed).toBe('all');
    // MIME dedicato: non deve essere scambiato per un drag di card singola.
    expect(dt.types).toContain('application/x-crono-squad');
    expect(dt.types).not.toContain('application/json');
    expect(readSquadDragData(dt as unknown as DataTransfer)).toEqual({ squadraId: 'SQ-1', fromDay: '2026-07-13' });
  });

  it('payload assente o malformato → null', () => {
    const vuoto = fakeDataTransfer();
    expect(readSquadDragData(vuoto as unknown as DataTransfer)).toBeNull();
    const rotto = fakeDataTransfer();
    rotto.setData('application/x-crono-squad', '{bad json');
    expect(readSquadDragData(rotto as unknown as DataTransfer)).toBeNull();
    const parziale = fakeDataTransfer();
    parziale.setData('application/x-crono-squad', JSON.stringify({ squadraId: 'x' }));
    expect(readSquadDragData(parziale as unknown as DataTransfer)).toBeNull();
  });
});

/** Assignment minimale per i test. */
function asg(over: Partial<Assignment> = {}): Assignment {
  return { id: 'x', day_id: 'd', reperibile: false, ...over };
}

describe('assignmentActivityIds (multi-attività con fallback alla primaria)', () => {
  it('usa activity_ids quando presente', () => {
    expect(assignmentActivityIds(asg({ activity_ids: ['a1', 'a2'] }))).toEqual(['a1', 'a2']);
  });
  it('fallback su activity (id singolo) quando activity_ids è assente/vuoto', () => {
    expect(assignmentActivityIds(asg({ activity: { id: 'a1', name: 'X' } }))).toEqual(['a1']);
    expect(assignmentActivityIds(asg({ activity_ids: [], activity: { id: 'a1', name: 'X' } }))).toEqual(['a1']);
  });
  it('nessuna attività → array vuoto', () => {
    expect(assignmentActivityIds(asg())).toEqual([]);
  });
});

describe('filterAssignments token ACT su più attività', () => {
  const rows = [
    asg({ id: 'r1', activity_ids: ['a1', 'a2'] }),
    asg({ id: 'r2', activity_ids: ['a3'] }),
    asg({ id: 'r3', activity: { id: 'a2', name: 'X' } }), // solo primaria
  ];
  it('match se UNA qualunque delle attività combacia', () => {
    const out = filterAssignments(rows, ['ACT:a2']).map((r) => r.id);
    expect(out).toEqual(['r1', 'r3']);
  });
  it('nessun match → esclusa', () => {
    expect(filterAssignments(rows, ['ACT:zzz'])).toHaveLength(0);
  });
});

describe('operatoriInMagazzino', () => {
  const staff = (id: string, over: Partial<Staff> = {}): Staff => ({ id, display_name: id, ...over });
  const visibili = [staff('s1'), staff('s2'), staff('s3')];

  it('esclude assegnati e assenti interi, tiene i restanti validi', () => {
    const out = operatoriInMagazzino(
      visibili,
      [asg({ staff: { id: 's1', display_name: 's1' } })],
      new Set(['s3']),
      '2026-07-23',
    );
    expect(out.map((s) => s.id)).toEqual(['s2']);
  });

  it('esclude chi non è valido quel giorno (fuori dal periodo)', () => {
    const conScadenza = [staff('s1', { valid_to: '2026-07-01' }), staff('s2')];
    const out = operatoriInMagazzino(conScadenza, [], new Set(), '2026-07-23', '2026-07-23');
    expect(out.map((s) => s.id)).toEqual(['s2']);
  });
});
