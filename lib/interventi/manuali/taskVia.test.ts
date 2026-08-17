import { describe, it, expect } from 'vitest';
import { isTaskVia, voceTaskVia, contenitoreTaskVia, ATTIVITA_TASK_VIA } from './taskVia';

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

  it('senza flag: la voce BONIFICHE EXTRA è contenitore lo stesso (l\'attività è il segnale), le altre no', () => {
    // Fix definitivo: anche su un template senza flag (es. un Italgas "ibrido nei fatti" ma con la
    // spunta task_via_ibrido dimenticata) una voce BONIFICHE EXTRA apre il contenitore; le attività
    // classiche restano classiche.
    expect(voceTaskVia(bonifica, {})).toBe(true);
    expect(voceTaskVia({ attivita: '  bonifiche extra ' }, {})).toBe(true);
    expect(voceTaskVia(classica, {})).toBe(false);
    expect(voceTaskVia({}, {})).toBe(false);
    expect(voceTaskVia(null, {})).toBe(false);
  });

  it('il flusso della voce (tplTaskVia) vince sul `tutto` di testata', () => {
    // Il caso PERUGIA 2026-08-17: testata BONIFICHE EXTRA (task_via) su un giro misto — le voci
    // Italgas (flusso proprio NON task-via) devono restare sul form esito classico.
    expect(voceTaskVia({ ...classica, tplTaskVia: false }, { tutto: true })).toBe(false);
    // Il flusso task-via della voce apre il contenitore anche se la testata non è task-via.
    expect(voceTaskVia({ ...classica, tplTaskVia: true }, {})).toBe(true);
    expect(voceTaskVia({ ...classica, tplTaskVia: true }, { ibrido: true })).toBe(true);
  });

  it('tplTaskVia NON smentisce mai l\'attività BONIFICHE EXTRA', () => {
    // Anche se la voce BONIFICHE EXTRA risolvesse a un flusso non task-via, resta un contenitore.
    expect(voceTaskVia({ ...bonifica, tplTaskVia: false }, {})).toBe(true);
    expect(voceTaskVia({ ...bonifica, tplTaskVia: false }, { tutto: true })).toBe(true);
  });

  it('tplTaskVia assente o null → vale la testata (voci storiche senza flusso proprio)', () => {
    expect(voceTaskVia({ ...classica, tplTaskVia: null }, { tutto: true })).toBe(true);
    expect(voceTaskVia({ ...classica, tplTaskVia: undefined }, { tutto: true })).toBe(true);
    expect(voceTaskVia({ attivita: '', tplTaskVia: null }, { tutto: true })).toBe(true);
  });
});

describe('contenitoreTaskVia', () => {
  const contenitore = { attivita: 'BONIFICHE EXTRA', manuale: false };
  // Un "+" sotto un task-via nasce con attività BONIFICHE EXTRA ma è un intervento vero.
  const ordineBonifica = { attivita: 'BONIFICHE EXTRA', manuale: true };

  it('la voce pianificata BONIFICHE EXTRA (manuale=false) è un contenitore', () => {
    expect(contenitoreTaskVia(contenitore, { ibrido: true })).toBe(true);
    expect(contenitoreTaskVia(contenitore, {})).toBe(true);
    expect(contenitoreTaskVia({ attivita: 'Sostituzione', manuale: false }, { tutto: true })).toBe(true);
  });

  it('un "+" (manuale=true) NON è mai un contenitore, neanche con attività BONIFICHE EXTRA', () => {
    expect(contenitoreTaskVia(ordineBonifica, { ibrido: true })).toBe(false);
    expect(contenitoreTaskVia(ordineBonifica, {})).toBe(false);
    // …e nemmeno in un template task-via puro (dove ogni voce pianificata è contenitore).
    expect(contenitoreTaskVia(ordineBonifica, { tutto: true })).toBe(false);
    expect(contenitoreTaskVia({ attivita: 'Sostituzione', manuale: true }, { tutto: true })).toBe(false);
  });

  it('coerente con voceTaskVia quando manuale è assente/false', () => {
    expect(contenitoreTaskVia({ attivita: 'BONIFICHE EXTRA' }, { ibrido: true })).toBe(true);
    expect(contenitoreTaskVia({ attivita: 'Sostituzione' }, { ibrido: true })).toBe(false);
    expect(contenitoreTaskVia(null, { tutto: true })).toBe(true);
  });

  it('rispetta il flusso della voce: classica con tplTaskVia=false NON è contenitore sotto testata task-via', () => {
    expect(contenitoreTaskVia({ attivita: 'S-PR-003 A', manuale: false, tplTaskVia: false }, { tutto: true })).toBe(false);
    // …ma il "+" resta escluso anche quando il SUO flusso è task-via.
    expect(contenitoreTaskVia({ attivita: 'Sostituzione', manuale: true, tplTaskVia: true }, {})).toBe(false);
  });
});
