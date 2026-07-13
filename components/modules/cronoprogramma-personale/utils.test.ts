import { describe, it, expect } from 'vitest';
import {
  writeAssignmentDragData,
  readAssignmentDragData,
  writeDayDragData,
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
