import { describe, it, expect } from 'vitest';
import { taskToIntervento } from './taskToIntervento';
import type { Task } from '@/utils/routing/types';

const task: Task = {
  id: 't1',
  odl: 'ODL123',
  pdr: 'PDR9',
  indirizzo: 'Via Roma 1',
  cap: '00100',
  citta: 'Roma',
  priorita: 0,
  fascia_oraria: '9-12',
  lat: 41.9,
  lng: 12.5,
  nominativo: 'Mario Rossi',
  matricola: 'M555',
  attivita: 'Sospensione',
};

const ctx = { committente: 'acea', data: '2026-06-03', staffId: 's1', pianoId: 'p1', territorioId: 'terr1' };

describe('taskToIntervento', () => {
  it('mappa i campi del task su un record intervento', () => {
    expect(taskToIntervento(task, ctx)).toMatchObject({
      committente: 'acea',
      odl: 'ODL123',
      pdr: 'PDR9',
      nominativo: 'Mario Rossi',
      indirizzo: 'Via Roma 1',
      comune: 'Roma',
      cap: '00100',
      lat: 41.9,
      lng: 12.5,
      fascia_oraria: '9-12',
      matricola_contatore: 'M555',
      intervento_tipo: 'Sospensione',
      data: '2026-06-03',
      staff_id: 's1',
      stato: 'assegnato',
      piano_id: 'p1',
      territorio_id: 'terr1',
      created_from_mappa: true,
    });
  });

  it('odl vuoto → null', () => {
    expect(taskToIntervento({ ...task, odl: '' }, ctx).odl).toBeNull();
  });

  it('stato sempre "assegnato" e created_from_mappa true', () => {
    const r = taskToIntervento(task, ctx);
    expect(r.stato).toBe('assegnato');
    expect(r.created_from_mappa).toBe(true);
  });
});
