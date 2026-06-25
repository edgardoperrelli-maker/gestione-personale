import { describe, it, expect } from 'vitest';
import { isTaskVia, voceTaskVia, ATTIVITA_TASK_VIA } from './taskVia';

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

describe('voceTaskVia', () => {
  const bonifica = { attivita: 'BONIFICHE EXTRA' };
  const classica = { attivita: 'Sostituzione' };

  it('tutto=true (task-via puro) → ogni voce è un contenitore', () => {
    expect(voceTaskVia(classica, { tutto: true })).toBe(true);
    expect(voceTaskVia(bonifica, { tutto: true })).toBe(true);
    expect(voceTaskVia(null, { tutto: true })).toBe(true);
  });

  it('ibrido=true → SOLO le voci BONIFICHE EXTRA sono contenitori, le classiche restano classiche', () => {
    expect(voceTaskVia(bonifica, { ibrido: true })).toBe(true);
    expect(voceTaskVia({ attivita: '  bonifiche extra ' }, { ibrido: true })).toBe(true);
    expect(voceTaskVia(classica, { ibrido: true })).toBe(false);
    expect(voceTaskVia({}, { ibrido: true })).toBe(false);
  });

  it('tutto ha precedenza sull\'ibrido', () => {
    expect(voceTaskVia(classica, { tutto: true, ibrido: true })).toBe(true);
  });

  it('nessuna modalità (template normale) → mai task-via', () => {
    expect(voceTaskVia(bonifica, {})).toBe(false);
    expect(voceTaskVia(classica, {})).toBe(false);
  });
});
