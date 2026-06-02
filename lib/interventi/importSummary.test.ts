import { describe, it, expect } from 'vitest';
import { formatImportSummary } from './importSummary';

describe('formatImportSummary', () => {
  it('usa il plurale per righe/inserimenti/aggiornamenti', () => {
    expect(formatImportSummary({ totaliRighe: 15, inseriti: 12, aggiornati: 3 }))
      .toBe('12 inseriti, 3 aggiornati su 15 righe');
  });

  it('usa il singolare per inserito/riga, plurale per 0 aggiornati', () => {
    expect(formatImportSummary({ totaliRighe: 1, inseriti: 1, aggiornati: 0 }))
      .toBe('1 inserito, 0 aggiornati su 1 riga');
  });

  it('gestisce il singolare di un solo aggiornamento', () => {
    expect(formatImportSummary({ totaliRighe: 1, inseriti: 0, aggiornati: 1 }))
      .toBe('0 inseriti, 1 aggiornato su 1 riga');
  });

  it('gestisce zero inserimenti e zero aggiornamenti', () => {
    expect(formatImportSummary({ totaliRighe: 0, inseriti: 0, aggiornati: 0 }))
      .toBe('0 inseriti, 0 aggiornati su 0 righe');
  });
});
