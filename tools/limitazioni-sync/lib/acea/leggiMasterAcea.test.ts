import { describe, it, expect } from 'vitest';
import { mappaRigheMaster } from './leggiMasterAcea.mjs';

describe('mappaRigheMaster', () => {
  const header = ['Descrizione Stato Ordine', 'Ordine', 'Matricola misuratore', 'INDIRIZZO', 'Località', 'Data', 'Esecutore'];
  const colonne = { odl: 'Ordine', esecutore: 'Esecutore', data: 'Data', matricola: 'Matricola misuratore', indirizzo: 'INDIRIZZO', comune: 'Località' };

  it('mappa le colonne per nome (robusto alla posizione)', () => {
    const matrix = [['x', '12345', 'M9', 'Via Roma 1', 'ROMA', '2026-06-22', 'ROSSI']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g).toEqual([{ riga: 2, odl: '12345', matricola: 'M9', indirizzo: 'Via Roma 1', comune: 'ROMA', esecutore: 'ROSSI', dataRaw: '2026-06-22', esitoRaw: '' }]);
  });

  it('numera le righe a partire da 2 (header su riga 1)', () => {
    const matrix = [['x', 'A', '', '', '', '', ''], ['x', 'B', '', '', '', '', '']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g.map((r) => r.riga)).toEqual([2, 3]);
  });

  it('cella mancante → stringa vuota', () => {
    const g = mappaRigheMaster([['x', '12345']], header, colonne);
    expect(g[0].matricola).toBe('');
    expect(g[0].esecutore).toBe('');
  });
});
