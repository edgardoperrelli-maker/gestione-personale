// utils/rapportini/diffRapportini.test.ts
import { describe, it, expect } from 'vitest';
import { calcolaDiffRapportini, decideSyncRapportini, type DiffInput } from './diffRapportini';

function base(over: Partial<DiffInput> = {}): DiffInput {
  return {
    operatoriProposti: [],
    vociEsistenti: [],
    staffConRapportino: new Set<string>(),
    staffInviati: new Set<string>(),
    taskCompletati: new Set<string>(),
    ...over,
  };
}

describe('decideSyncRapportini', () => {
  // task t1 spostato da s1 (Mario) a s2 (Luigi); entrambi con rapportino.
  function diffSpostamento(over: Partial<DiffInput> = {}) {
    return calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
      ...over,
    }));
  }

  it('movimenti SENZA inviati coinvolti → niente conferma, niente avviso (sync automatica)', () => {
    const d = decideSyncRapportini(diffSpostamento());
    expect(d.richiediConfermaInviati).toBe(false);
    expect(d.avvisoBloccati).toBeNull();
  });

  it('rapportino inviato coinvolto → richiede conferma', () => {
    const d = decideSyncRapportini(diffSpostamento({ staffInviati: new Set(['s2']) }));
    expect(d.richiediConfermaInviati).toBe(true);
  });

  it('intervento completato spostato → avviso valorizzato (non bloccante)', () => {
    const d = decideSyncRapportini(diffSpostamento({ taskCompletati: new Set(['t1']) }));
    expect(d.avvisoBloccati).toContain('ODL-1');
    // il completato non genera "inviato coinvolto" di per sé
    expect(d.richiediConfermaInviati).toBe(false);
  });

  it('nessuna modifica → niente conferma, niente avviso', () => {
    const d = decideSyncRapportini(calcolaDiffRapportini(base()));
    expect(d).toEqual({ avvisoBloccati: null, richiediConfermaInviati: false });
  });
});

describe('calcolaDiffRapportini', () => {
  it('spostamento: task passa da Mario a Luigi', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
    }));
    expect(out.spostamenti).toHaveLength(1);
    expect(out.spostamenti[0]).toMatchObject({ taskId: 't1', daStaffId: 's1', aStaffId: 's2' });
    expect(out.bloccati).toEqual([]);
    expect(out.nessunaModifica).toBe(false);
  });

  it('blocco: un task completato che cambia operatore finisce in bloccati, non in spostamenti', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
      taskCompletati: new Set(['t1']),
    }));
    expect(out.spostamenti).toEqual([]);
    expect(out.bloccati).toHaveLength(1);
    expect(out.bloccati[0]).toMatchObject({ taskId: 't1', motivo: 'completato' });
  });

  it('stesso operatore: nessun movimento', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [{ staffId: 's1', staffName: 'Mario', tasks: [{ taskId: 't1', descr: 'ODL-1' }] }],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1']),
    }));
    expect(out.nessunaModifica).toBe(true);
  });

  it('nuovo link: operatore con task ma senza rapportino esistente', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [{ staffId: 's3', staffName: 'Giovanni', tasks: [{ taskId: 't9', descr: 'ODL-9' }] }],
      vociEsistenti: [],
      staffConRapportino: new Set<string>(),
    }));
    expect(out.nuoviLink).toEqual([{ staffId: 's3', staffName: 'Giovanni' }]);
  });

  it('svuotato: operatore ancora in lista con rapportino ma 0 task', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [{ staffId: 's1', staffName: 'Mario', tasks: [] }],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1']),
    }));
    expect(out.svuotati).toEqual([{ staffId: 's1', staffName: 'Mario' }]);
  });

  it('inviati coinvolti: la destinazione di uno spostamento ha rapportino inviato', () => {
    const out = calcolaDiffRapportini(base({
      operatoriProposti: [
        { staffId: 's1', staffName: 'Mario', tasks: [] },
        { staffId: 's2', staffName: 'Luigi', tasks: [{ taskId: 't1', descr: 'ODL-1' }] },
      ],
      vociEsistenti: [{ taskId: 't1', staffId: 's1', staffName: 'Mario', descr: 'ODL-1' }],
      staffConRapportino: new Set(['s1', 's2']),
      staffInviati: new Set(['s2']),
    }));
    expect(out.inviatiCoinvolti).toEqual([{ staffId: 's2', staffName: 'Luigi' }]);
  });

  it('nessuna modifica con input vuoto', () => {
    const out = calcolaDiffRapportini(base());
    expect(out.nessunaModifica).toBe(true);
    expect(out).toMatchObject({ spostamenti: [], nuoviLink: [], svuotati: [], bloccati: [] });
  });
});
