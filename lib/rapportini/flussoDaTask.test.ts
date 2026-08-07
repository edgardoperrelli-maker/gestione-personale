import { describe, it, expect } from 'vitest';
import { classificaTask, risolviFlussoDaTask } from './flussoDaTask';
import { buildTassonomiaIndex, chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const riga = (committente: string, descrizione: string, gruppo: string): TassonomiaRiga => ({
  committente, descrizione, descrizioneNorm: chiaveTassonomia(descrizione), gruppo, attivo: true,
});

const INDEX = buildTassonomiaIndex([
  riga('acea', 'Regolarizzazione flusso idrico', 'DUNNING'),
  riga('acea', 'Riattivazione fornitura', 'DUNNING'),
  riga('acqualatina', 'Sostituzione misuratore', 'SOSTITUZIONE MISURATORI'),
  riga('italgas', 'S-PR-004 A', "ATTIVITA' ALLA CLIENTELA"),
]);

const FLUSSI = [
  { id: 'f-dunning', nome: 'LIMITAZIONI/SOSPENSIONI', gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'] },
  { id: 'f-massive', nome: 'RAPPORTINO LIMITAZIONI MASSIVE', gruppo_committente: 'acea', gruppi_attivita: ['LIMITAZIONI MASSIVE'] },
  { id: 'f-acqua', nome: 'ACQUALATINA SOSTITUZIONE MISURATORI', gruppo_committente: 'acqualatina', gruppi_attivita: ['SOSTITUZIONE MISURATORI'] },
  { id: 'f-italgas', nome: 'ITALGAS', gruppo_committente: 'italgas', gruppi_attivita: ["ATTIVITA' ALLA CLIENTELA", 'BONIFICHE'] },
];

describe('classificaTask', () => {
  it('task senza committente: lo deduce dall’attività (le descrizioni non sono ambigue)', () => {
    expect(classificaTask({ attivita: 'Regolarizzazione flusso idrico' }, INDEX))
      .toEqual({ committente: 'acea', gruppo: 'DUNNING' });
  });

  it('committente dichiarato sul task: vince sulla deduzione', () => {
    expect(classificaTask({ committente: 'acqualatina', attivita: 'Sostituzione misuratore' }, INDEX))
      .toEqual({ committente: 'acqualatina', gruppo: 'SOSTITUZIONE MISURATORI' });
  });

  it('committente + gruppo già sul task: nessun lookup', () => {
    expect(classificaTask({ committente: 'acea', gruppo_attivita: 'LIMITAZIONI MASSIVE', attivita: 'qualsiasi' }, INDEX))
      .toEqual({ committente: 'acea', gruppo: 'LIMITAZIONI MASSIVE' });
  });

  it('lim_massive equivale ad acea (marcatore di canale, non committente)', () => {
    expect(classificaTask({ committente: 'lim_massive', gruppo_attivita: 'LIMITAZIONI MASSIVE' }, INDEX))
      .toEqual({ committente: 'acea', gruppo: 'LIMITAZIONI MASSIVE' });
  });

  it('attività fuori catalogo o assente → non classificabile (mai un ripiego)', () => {
    expect(classificaTask({ attivita: 'ATTIVITÀ CHE NON ESISTE' }, INDEX)).toBeNull();
    expect(classificaTask({ attivita: '' }, INDEX)).toBeNull();
    expect(classificaTask(null, INDEX)).toBeNull();
  });

  it('committente noto ma attività non sua → non classificabile', () => {
    expect(classificaTask({ committente: 'italgas', attivita: 'Regolarizzazione flusso idrico' }, INDEX)).toBeNull();
  });
});

describe('risolviFlussoDaTask', () => {
  it('il task ACEA del file template ODL prende il flusso DUNNING, non il modulo di ripiego', () => {
    const f = risolviFlussoDaTask({ attivita: 'Regolarizzazione flusso idrico' }, INDEX, FLUSSI);
    expect(f?.id).toBe('f-dunning');
  });

  it('un task AcquaLatina resta sul suo flusso', () => {
    const f = risolviFlussoDaTask({ committente: 'acqualatina', attivita: 'Sostituzione misuratore' }, INDEX, FLUSSI);
    expect(f?.id).toBe('f-acqua');
  });

  it('task non classificabile → nessun flusso (la voce resterà senza campi, non con quelli altrui)', () => {
    expect(risolviFlussoDaTask({ attivita: 'BOH' }, INDEX, FLUSSI)).toBeNull();
  });

  it('gruppo classificato ma senza flusso collegato → null', () => {
    const soloAcqua = FLUSSI.filter((f) => f.id === 'f-acqua');
    expect(risolviFlussoDaTask({ attivita: 'Riattivazione fornitura' }, INDEX, soloAcqua)).toBeNull();
  });
});
