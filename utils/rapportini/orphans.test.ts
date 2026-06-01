import { describe, it, expect } from 'vitest';
import { orphanRapportini } from './orphans';

describe('orphanRapportini', () => {
  const existing = [
    { id: 'r1', staff_id: 'a' },
    { id: 'r2', staff_id: 'b' },
    { id: 'r3', staff_id: 'c' },
  ];
  it('ritorna gli id dei rapportini il cui staff_id non è più nel piano', () => {
    expect(orphanRapportini(existing, ['a', 'c'])).toEqual(['r2']);
  });
  it('ritorna [] se tutti gli staff_id sono ancora presenti', () => {
    expect(orphanRapportini(existing, ['a', 'b', 'c', 'd'])).toEqual([]);
  });
  it('ritorna tutti gli id se currentStaffIds è vuoto', () => {
    expect(orphanRapportini(existing, [])).toEqual(['r1', 'r2', 'r3']);
  });
});
