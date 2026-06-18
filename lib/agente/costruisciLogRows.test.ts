import { describe, it, expect } from 'vitest';
import { costruisciLogRows } from './costruisciLogRows';
import type { Task } from '@/utils/routing/types';

const task = (id: string): Task => ({
  id, odl: '', indirizzo: '', cap: '', citta: 'ZAGAROLO',
  priorita: 0, fascia_oraria: '', attivita: 'LIMITAZIONI MASSIVE',
});

describe('costruisciLogRows', () => {
  it('una riga per operatore, n_interventi = numero task', () => {
    const rows = costruisciLogRows({
      data: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx',
      pianoId: 'piano1', userId: 'user1',
      operatori: [
        { staffId: 's1', staffName: 'CIARALLO', tasks: [task('a'), task('b')] },
        { staffId: 's2', staffName: 'PASTORELLI', tasks: [task('c')] },
      ],
    });
    expect(rows).toEqual([
      { data_pianificata: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx', staff_id: 's1', staff_name: 'CIARALLO', n_interventi: 2, piano_id: 'piano1', creato_da: 'user1' },
      { data_pianificata: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx', staff_id: 's2', staff_name: 'PASTORELLI', n_interventi: 1, piano_id: 'piano1', creato_da: 'user1' },
    ]);
  });

  it('nessun operatore -> array vuoto', () => {
    const rows = costruisciLogRows({
      data: '2026-06-19', comune: 'ZAGAROLO', file: 'ZAGAROLO.xlsx',
      pianoId: 'piano1', userId: 'user1', operatori: [],
    });
    expect(rows).toEqual([]);
  });
});
