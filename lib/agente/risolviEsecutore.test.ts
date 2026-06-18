import { describe, it, expect } from 'vitest';
import { risolviEsecutore } from './risolviEsecutore';

const staff = [
  { id: 's1', display_name: 'CIARALLO SIMONE' },
  { id: 's2', display_name: 'PASTORELLI LUIGI' },
  { id: 's3', display_name: 'ROSSI MARIO' },
  { id: 's4', display_name: 'ROSSI ANNA' },
];

describe('risolviEsecutore', () => {
  it('match per cognome (primo token, case-insensitive)', () => {
    expect(risolviEsecutore('CIARALLO', staff)).toEqual({ staffId: 's1', staffName: 'CIARALLO SIMONE' });
    expect(risolviEsecutore('  pastorelli ', staff)).toEqual({ staffId: 's2', staffName: 'PASTORELLI LUIGI' });
  });
  it('nessun match → non_trovato', () => {
    expect(risolviEsecutore('BIANCHI', staff)).toEqual({ errore: 'non_trovato' });
    expect(risolviEsecutore('', staff)).toEqual({ errore: 'non_trovato' });
  });
  it('più match stesso cognome → ambiguo', () => {
    expect(risolviEsecutore('ROSSI', staff)).toEqual({ errore: 'ambiguo' });
  });
});
