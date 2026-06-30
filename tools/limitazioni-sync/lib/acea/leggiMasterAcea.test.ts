import { describe, it, expect } from 'vitest';
import { mappaRigheMaster, trovaIntestazioneAcea } from './leggiMasterAcea.mjs';

describe('trovaIntestazioneAcea', () => {
  it('trova la riga con la colonna chiave (per nome)', () => {
    const righe = [['titolo', ''], ['', ''], ['Ordine', 'Esecutore', 'Data']];
    expect(trovaIntestazioneAcea(righe, 'Ordine')).toBe(3);
  });
  it('robusto ad accenti/maiuscole', () => {
    const righe = [['ORDINE', 'Localita']];
    expect(trovaIntestazioneAcea(righe, 'Ordine')).toBe(1);
  });
  it('fallback riga 1 se non trovata', () => {
    expect(trovaIntestazioneAcea([['a', 'b']], 'Ordine')).toBe(1);
  });
});

describe('mappaRigheMaster', () => {
  const header = ['Stato Operazione', 'Ordine', 'Matricola misuratore', 'INDIRIZZO', 'Località', 'Data', 'Esecutore'];
  const colonne = { odl: 'Ordine', esecutore: 'Esecutore', data: 'Data', matricola: 'Matricola misuratore', indirizzo: 'INDIRIZZO', comune: 'Località', stato: 'Stato Operazione' };

  it('mappa le colonne per nome e legge lo stato', () => {
    const matrix = [['completato', '12345', 'M9', 'Via Roma 1', 'ROMA', '2026-06-22', 'ROSSI']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g).toEqual([{ riga: 2, odl: '12345', matricola: 'M9', indirizzo: 'Via Roma 1', comune: 'ROMA', esecutore: 'ROSSI', attivita: '', dataRaw: '2026-06-22', esitoRaw: '', statoRaw: 'completato' }]);
  });

  it('legge l\'attività dalla colonna "Operazione testo breve" quando configurata', () => {
    const headerA = ['Ordine', 'Operazione testo breve', 'Esecutore', 'Data'];
    const colonneA = { ...colonne, attivita: 'Operazione testo breve' };
    const g = mappaRigheMaster([['777', 'SOSPENSIONE', 'ROSSI', '2026-06-22']], headerA, colonneA);
    expect(g[0].attivita).toBe('SOSPENSIONE');
  });

  it('numera le righe a partire da 2 (header su riga 1)', () => {
    const matrix = [['', 'A', '', '', '', '', ''], ['', 'B', '', '', '', '', '']];
    const g = mappaRigheMaster(matrix, header, colonne);
    expect(g.map((r) => r.riga)).toEqual([2, 3]);
  });

  it('cella mancante → stringa vuota', () => {
    const g = mappaRigheMaster([['', '12345']], header, colonne);
    expect(g[0].matricola).toBe('');
    expect(g[0].esecutore).toBe('');
  });

  it('stato assente nel config → statoRaw vuoto', () => {
    const colonneNoStato = { odl: 'Ordine', esecutore: 'Esecutore', data: 'Data', matricola: 'Matricola misuratore', indirizzo: 'INDIRIZZO', comune: 'Località' };
    const g = mappaRigheMaster([['x', '12345', '', '', '', '', '']], header, colonneNoStato);
    expect(g[0].statoRaw).toBe('');
  });
});
