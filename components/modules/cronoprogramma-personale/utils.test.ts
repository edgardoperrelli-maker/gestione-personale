import { describe, it, expect } from 'vitest';
import {
  writeAssignmentDragData,
  readAssignmentDragData,
  writeDayDragData,
  writeSquadDragData,
  readSquadDragData,
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
