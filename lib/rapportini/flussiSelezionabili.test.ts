import { describe, it, expect } from 'vitest';
import { flussiSelezionabili, type FlussoRow } from './flussiSelezionabili';

const F = (o: Partial<FlussoRow>): FlussoRow => ({ id: 'x', nome: 'X', ...o });

describe('flussiSelezionabili', () => {
  it('etichetta con committente e gruppi quando il flusso li dichiara', () => {
    const out = flussiSelezionabili([
      F({ id: 'a', nome: 'ACQUALATINA SOSTITUZIONE MISURATORI', gruppo_committente: 'acqualatina', gruppi_attivita: ['SOSTITUZIONE MISURATORI'] }),
    ]);
    expect(out).toEqual([
      { id: 'a', etichetta: 'ACQUALATINA SOSTITUZIONE MISURATORI · AcquaLatina · SOSTITUZIONE MISURATORI', gruppoCommittente: 'acqualatina' },
    ]);
  });

  it('più gruppi si elencano (IBRIDO ACEA ne copre due)', () => {
    const out = flussiSelezionabili([
      F({ id: 'i', nome: 'IBRIDO ACEA', gruppo_committente: 'acea', gruppi_attivita: ['LIMITAZIONI MASSIVE', 'DUNNING'] }),
    ]);
    expect(out[0].etichetta).toBe('IBRIDO ACEA · Acea · LIMITAZIONI MASSIVE, DUNNING');
  });

  it('flusso senza committente: solo il nome, nessuna coda a metà', () => {
    const out = flussiSelezionabili([F({ id: 'n', nome: 'GENERICO', gruppo_committente: null, gruppi_attivita: null })]);
    expect(out[0]).toEqual({ id: 'n', etichetta: 'GENERICO', gruppoCommittente: null });
  });

  it('esclude i solo_manuale e gli spenti — la regola del server', () => {
    const out = flussiSelezionabili([
      F({ id: 'ok', nome: 'BUONO' }),
      F({ id: 'plus', nome: 'MODELLO PLUS', solo_manuale: true }),
      F({ id: 'off', nome: 'SPENTO', active: false }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['ok']);
  });

  it('NON esclude i riservati: il server non li esclude per il modello di un piano', () => {
    const out = flussiSelezionabili([F({ id: 'pi', nome: 'PRONTO INTERVENTO' })]);
    expect(out.map((o) => o.id)).toEqual(['pi']);
  });

  it('ordina per etichetta con collation italiana', () => {
    const out = flussiSelezionabili([
      F({ id: 'z', nome: 'ZAGAROLO' }),
      F({ id: 'a', nome: 'àcaro' }),
      F({ id: 'i', nome: 'ITALGAS' }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['a', 'i', 'z']);
  });

  it('righe senza id o senza nome non rompono la tendina', () => {
    const out = flussiSelezionabili([F({ id: '', nome: 'ORFANO' }), F({ id: 's', nome: null })]);
    expect(out).toEqual([{ id: 's', etichetta: '(senza nome)', gruppoCommittente: null }]);
  });
});
