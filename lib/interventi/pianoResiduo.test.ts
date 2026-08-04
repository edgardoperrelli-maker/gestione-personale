import { describe, it, expect } from 'vitest';
import { pianoResiduoEliminabile } from './pianoResiduo';

describe('pianoResiduoEliminabile (anti-duplicato)', () => {
  it('eliminabile solo senza rapportini E senza interventi del registro', () => {
    expect(pianoResiduoEliminabile(0, 0)).toBe(true);
  });

  it('un rapportino àncora il piano (comportamento storico)', () => {
    expect(pianoResiduoEliminabile(1, 0)).toBe(false);
  });

  it('un intervento del registro àncora il piano: la Mappa non saprebbe ricrearlo dai task', () => {
    // È la finestra fra `pianifica` (interventi con piano_id) e «Genera rapportini»:
    // prima dell'unificazione commessa il piano sarebbe stato raso con tutto il lavoro.
    expect(pianoResiduoEliminabile(0, 1)).toBe(false);
    expect(pianoResiduoEliminabile(2, 3)).toBe(false);
  });
});
