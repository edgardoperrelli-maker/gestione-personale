import { describe, it, expect } from 'vitest';
import { planInterventi } from './planInterventiForPiano';
import type { Task } from '@/utils/routing/types';

const task = (over: Partial<Task>): Task => ({
  id: 't', odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over,
});

describe('planInterventi', () => {
  const piano = { data: '2026-06-03' };
  const base = { piano, pianoId: 'p1', territorioId: null as string | null };

  it('mappa i task in interventi assegnati', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1', citta: 'Roma' })] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(1);
    expect(r.daInserire[0]).toMatchObject({
      odl: 'A1', staff_id: 's1', data: '2026-06-03', stato: 'assegnato', piano_id: 'p1', comune: 'Roma',
    });
    expect(r.idDaEliminare).toEqual([]);
  });

  it('elimina i non-terminali e preserva (non duplica) i terminali', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' }), task({ odl: 'CHIUSO' })] }],
      esistenti: [
        { id: 'e1', odl: 'A1', stato: 'assegnato' },
        { id: 'e2', odl: 'CHIUSO', stato: 'completato' },
      ],
    });
    expect(r.idDaEliminare).toEqual(['e1']);
    const odls = r.daInserire.map((x) => x.odl);
    expect(odls).toContain('A1');
    expect(odls).not.toContain('CHIUSO');
  });

  it('dedup interno per odl', () => {
    const r = planInterventi({
      ...base,
      operatori: [
        { staff_id: 's1', tasks: [task({ odl: 'DUP' })] },
        { staff_id: 's2', tasks: [task({ odl: 'DUP' })] },
      ],
      esistenti: [],
    });
    expect(r.daInserire.filter((x) => x.odl === 'DUP')).toHaveLength(1);
  });

  it('scarta odl già presenti su altri piani della stessa data', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'X9' })] }],
      esistenti: [],
      odlGiaPresenti: new Set(['X9']),
    });
    expect(r.daInserire).toHaveLength(0);
  });

  it('le righe senza odl non vengono deduplicate', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '' }), task({ odl: '' })] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(2);
  });

  it('non duplica un intervento terminale SENZA odl (identità matricola+indirizzo)', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M1', indirizzo: 'Via Roma 1' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1' },
      ],
    });
    // il task corrisponde a un intervento GIÀ completato → niente duplicato, terminale preservato
    expect(r.daInserire).toHaveLength(0);
    expect(r.idDaEliminare).toEqual([]);
  });

  it('non accorpa interventi senza odl con matricola diversa', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M2', indirizzo: 'Via Roma 1' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1' },
      ],
    });
    // matricola diversa → job distinto → va inserito (no over-dedup)
    expect(r.daInserire).toHaveLength(1);
  });

  it('un intervento annullato esistente NON viene preservato: segue i task (reversibile)', () => {
    const out = planInterventi({
      piano: { data: '2026-06-10' }, pianoId: 'p1', territorioId: null,
      operatori: [{ staff_id: 's1', tasks: [{ id: 't1', odl: 'ODL1', indirizzo: 'V', cap: '0', citta: 'R', priorita: 0, fascia_oraria: '' }] }],
      esistenti: [{ id: 'i1', odl: 'ODL1', stato: 'annullato' }],
    });
    expect(out.idDaEliminare).toContain('i1');
  });
});
