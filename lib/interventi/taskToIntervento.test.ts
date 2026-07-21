import { describe, it, expect } from 'vitest';
import { taskToIntervento } from './taskToIntervento';
import type { Task } from '@/utils/routing/types';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

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

const INDICE = buildTassonomiaIndex([
  {
    committente: 'acea',
    descrizione: 'Limitazione Massiva su Impianto',
    descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO',
    gruppo: 'LIMITAZIONI MASSIVE',
    attivo: true,
  },
  {
    committente: 'italgas',
    descrizione: 'S-PR-003 A',
    descrizioneNorm: 'S-PR-003 A',
    gruppo: "ATTIVITA' ALLA CLIENTELA",
    attivo: true,
  },
] as TassonomiaRiga[]);

describe('taskToIntervento — tassonomia', () => {
  it('attività riconosciuta → canonica + gruppo_attivita (committente del piano)', () => {
    const r = taskToIntervento({ ...task, attivita: ' limitazione massiva su impianto ' }, ctx, INDICE);
    expect(r.intervento_tipo).toBe('Limitazione Massiva su Impianto');
    expect(r.gruppo_attivita).toBe('LIMITAZIONI MASSIVE');
    expect(r.committente).toBe('acea');
  });
  it('giro misto: attività ITALGAS in piano base acea → committente e gruppo dalla tassonomia', () => {
    const r = taskToIntervento({ ...task, attivita: 's-pr-003 a' }, ctx, INDICE);
    expect(r.intervento_tipo).toBe('S-PR-003 A');
    expect(r.gruppo_attivita).toBe("ATTIVITA' ALLA CLIENTELA");
    expect(r.committente).toBe('italgas');
  });
  it('attività ignota → comportamento storico, gruppo null e committente base (soft)', () => {
    const r = taskToIntervento({ ...task, attivita: 'QUALCOSA' }, ctx, INDICE);
    expect(r.intervento_tipo).toBe('QUALCOSA');
    expect(r.gruppo_attivita).toBeNull();
    expect(r.committente).toBe('acea');
  });
  it('senza indice → gruppo null, nessun errore', () => {
    const r = taskToIntervento({ ...task, attivita: 'X' }, ctx);
    expect(r.gruppo_attivita).toBeNull();
    expect(r.committente).toBe('acea');
  });
});

const ctxAnn = { committente: 'acea', data: '2026-06-10', staffId: 's1', pianoId: 'p1', territorioId: null };
const baseTask = (over: Partial<Task> = {}): Task => ({ id: 't1', odl: 'ODL1', indirizzo: 'Via 1', cap: '00100', citta: 'Roma', priorita: 0, fascia_oraria: '', ...over });

describe('taskToIntervento — stato annullato', () => {
  it('task annullato → intervento stato "annullato"', () => {
    expect(taskToIntervento(baseTask({ annullato: true }), ctxAnn).stato).toBe('annullato');
  });
  it('task normale → intervento stato "assegnato"', () => {
    expect(taskToIntervento(baseTask(), ctxAnn).stato).toBe('assegnato');
  });
});
