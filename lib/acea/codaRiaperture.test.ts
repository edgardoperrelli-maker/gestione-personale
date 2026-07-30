import { describe, it, expect } from 'vitest';
import {
  assegnata, contaDaAssegnare, esitataNeiRapportini, type InterventoDellOdl,
} from './codaRiaperture';

const int = (over: Partial<InterventoDellOdl> = {}): InterventoDellOdl => ({
  staff_id: 's1', stato: 'assegnato', ...over,
});

describe('esitataNeiRapportini', () => {
  it('un intervento completato la esita', () => {
    expect(esitataNeiRapportini([int({ stato: 'completato' })])).toBe(true);
    expect(esitataNeiRapportini([int(), int({ stato: 'completato' })])).toBe(true);
  });

  it('assegnata non vuol dire fatta', () => {
    // È il punto della scheda: le assegnate del giorno restano a vista finché non arrivano in fondo.
    expect(esitataNeiRapportini([int({ stato: 'assegnato' })])).toBe(false);
  });

  it('un annullato non esita niente', () => {
    expect(esitataNeiRapportini([int({ stato: 'annullato' })])).toBe(false);
  });

  it('senza interventi non c’è niente di esitato', () => {
    expect(esitataNeiRapportini([])).toBe(false);
  });
});

describe('assegnata', () => {
  it('un intervento vivo con un esecutore assegna', () => {
    expect(assegnata([int()])).toBe(true);
  });

  it('un intervento ANNULLATO con un esecutore non assegna: quel lavoro non è mai successo', () => {
    expect(assegnata([int({ stato: 'annullato' })])).toBe(false);
  });

  it('un intervento senza esecutore non assegna', () => {
    expect(assegnata([int({ staff_id: null })])).toBe(false);
    expect(assegnata([])).toBe(false);
  });
});

describe('contaDaAssegnare', () => {
  const indice = (voci: Record<string, InterventoDellOdl[]>) =>
    new Map(Object.entries(voci));

  it('conta le aperte senza nessun esecutore', () => {
    const n = contaDaAssegnare(
      ['A', 'B', 'C'],
      indice({ A: [int()], B: [], C: [int({ staff_id: null })] }),
    );
    expect(n).toBe(2);   // B (nessun intervento) e C (intervento senza esecutore)
  });

  it('un ODL senza traccia negli interventi è da assegnare', () => {
    expect(contaDaAssegnare(['X'], indice({}))).toBe(1);
  });

  it('le esitate nei rapportini NON si contano: sono finite, non «senza assegnazione»', () => {
    // Completata da noi ma ancora aperta su ACEA (l'import non è ancora passato): il badge non
    // deve gridare per lavoro già fatto.
    const n = contaDaAssegnare(['A'], indice({ A: [int({ staff_id: null, stato: 'completato' })] }));
    expect(n).toBe(0);
  });

  it('un’assegnazione poi annullata torna da assegnare', () => {
    expect(contaDaAssegnare(['A'], indice({ A: [int({ stato: 'annullato' })] }))).toBe(1);
  });

  it('più operazioni sullo stesso ODL sono un lavoro solo: si conta una volta', () => {
    expect(contaDaAssegnare(['A', 'A'], indice({}))).toBe(1);
  });

  it('nessuna riapertura aperta: zero, non un errore', () => {
    expect(contaDaAssegnare([], indice({}))).toBe(0);
  });
});
