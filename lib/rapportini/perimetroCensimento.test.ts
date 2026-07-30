import { describe, it, expect } from 'vitest';
import { perimetroCensimento } from './perimetroCensimento';

describe('perimetroCensimento', () => {
  it('i due committenti con un censimento consultabile dal campo', () => {
    expect(perimetroCensimento('acea')).toBe('acea');
    expect(perimetroCensimento('acqualatina')).toBe('acqualatina');
  });

  it('tollera maiuscole e spazi: il valore arriva da una colonna testo', () => {
    expect(perimetroCensimento('ACQUALATINA')).toBe('acqualatina');
    expect(perimetroCensimento('  Acea  ')).toBe('acea');
  });

  it('chi non ha censimento non scarica niente', () => {
    // Italgas ha il suo `risanamento_misuratori_ref`, ma non alimenta il "+" per matricola.
    expect(perimetroCensimento('italgas')).toBeNull();
    expect(perimetroCensimento('altro')).toBeNull();
  });

  it('flusso senza committente dichiarato → nessun download', () => {
    // Il CHECK in DB ammette gruppo_committente null (con gruppi_attivita vuoto): sono i
    // flussi non ancora collocati nell'albero di Azioni operatori.
    expect(perimetroCensimento(null)).toBeNull();
    expect(perimetroCensimento(undefined)).toBeNull();
    expect(perimetroCensimento('')).toBeNull();
    expect(perimetroCensimento('   ')).toBeNull();
  });

  it('un valore inatteso non apre un download a caso', () => {
    expect(perimetroCensimento('lim_massive')).toBeNull(); // committente del "+", non del flusso
    expect(perimetroCensimento('acqua latina')).toBeNull();
  });
});
