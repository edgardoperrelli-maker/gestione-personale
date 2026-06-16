import { describe, it, expect } from 'vitest';
import { isTaskVia, ATTIVITA_TASK_VIA } from './taskVia';

describe('isTaskVia', () => {
  it('riconosce una voce con attività BONIFICHE EXTRA (case/spazi tolleranti)', () => {
    expect(isTaskVia({ attivita: 'BONIFICHE EXTRA' })).toBe(true);
    expect(isTaskVia({ attivita: '  bonifiche extra ' })).toBe(true);
  });
  it('false per attività diverse o assenti', () => {
    expect(isTaskVia({ attivita: 'Sostituzione' })).toBe(false);
    expect(isTaskVia({ attivita: '' })).toBe(false);
    expect(isTaskVia({})).toBe(false);
    expect(isTaskVia(null)).toBe(false);
  });
  it('espone la costante', () => {
    expect(ATTIVITA_TASK_VIA).toBe('BONIFICHE EXTRA');
  });
});
