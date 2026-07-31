import { describe, it, expect } from 'vitest';
import {
  contaSenzaData, esitataNeiRapportini, pianificata, type InterventoDellOdl,
} from './codaRiaperture';

const int = (over: Partial<InterventoDellOdl> = {}): InterventoDellOdl => ({
  staff_id: 's1', stato: 'assegnato', esito: null, ...over,
});

describe('esitataNeiRapportini', () => {
  it('un intervento con esito POSITIVO la esita', () => {
    expect(esitataNeiRapportini([int({ stato: 'completato', esito: 'eseguito_positivo' })])).toBe(true);
    expect(esitataNeiRapportini([int(), int({ stato: 'completato', esito: 'eseguito_positivo' })])).toBe(true);
  });

  it('un\'uscita a vuoto NON esita: l\'ordine è ancora da lavorare', () => {
    // «Completato» è l'uscita, non il lavoro: chiusa a vuoto, la riapertura resta in coda —
    // è esattamente la riga che la scheda esiste per non far sfuggire.
    expect(esitataNeiRapportini([int({ stato: 'completato', esito: null })])).toBe(false);
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

describe('pianificata', () => {
  it('un intervento vivo è una data in calendario: la data di un intervento non è mai vuota', () => {
    expect(pianificata([int()])).toBe(true);
    // Anche senza esecutore: la DATA c'è, e il triangolo conta le senza-data.
    expect(pianificata([int({ staff_id: null })])).toBe(true);
  });

  it('un intervento ANNULLATO non pianifica: quel lavoro non è mai successo', () => {
    expect(pianificata([int({ stato: 'annullato' })])).toBe(false);
  });

  it('un\'uscita registrata non è in calendario: quel giorno è consumato', () => {
    // Uscita a vuoto e nessun intervento in corso: la prossima uscita una data non ce l'ha
    // ancora, e il triangolo la deve contare.
    expect(pianificata([int({ stato: 'completato', esito: null })])).toBe(false);
  });

  it('senza interventi non c’è nessuna data', () => {
    expect(pianificata([])).toBe(false);
  });
});

describe('contaSenzaData', () => {
  const indice = (voci: Record<string, InterventoDellOdl[]>) =>
    new Map(Object.entries(voci));

  it('conta le aperte che non hanno NESSUN intervento vivo', () => {
    const n = contaSenzaData(
      ['A', 'B', 'C'],
      indice({ A: [int()], B: [], C: [int({ stato: 'annullato' })] }),
    );
    expect(n).toBe(2);   // B (mai pianificata) e C (la pianificazione è stata annullata)
  });

  it('una riga con la data ma senza esecutore NON si conta: la data ce l’ha', () => {
    // Quella riga la ferma il motore rapportini (409 righe a metà), non il triangolo.
    expect(contaSenzaData(['A'], indice({ A: [int({ staff_id: null })] }))).toBe(0);
  });

  it('un ODL senza traccia negli interventi è senza data', () => {
    expect(contaSenzaData(['X'], indice({}))).toBe(1);
  });

  it('le esitate nei rapportini NON si contano: sono finite, non «senza data»', () => {
    // Eseguita POSITIVA da noi ma ancora aperta su ACEA (l'import non è ancora passato): il
    // triangolo non deve gridare per lavoro già fatto.
    const n = contaSenzaData(
      ['A'],
      indice({ A: [int({ stato: 'completato', esito: 'eseguito_positivo' })] }),
    );
    expect(n).toBe(0);
  });

  it('un\'uscita a vuoto senza nuova pianificazione SI conta: può ancora sfuggire', () => {
    const n = contaSenzaData(['A'], indice({ A: [int({ stato: 'completato', esito: null })] }));
    expect(n).toBe(1);
  });

  it('uscita a vuoto ma già ripianificata: la data ce l\'ha, non si conta', () => {
    const n = contaSenzaData(
      ['A'],
      indice({ A: [int({ stato: 'completato', esito: null }), int({ stato: 'assegnato' })] }),
    );
    expect(n).toBe(0);
  });

  it('più operazioni sullo stesso ODL sono un lavoro solo: si conta una volta', () => {
    expect(contaSenzaData(['A', 'A'], indice({}))).toBe(1);
  });

  it('nessuna riapertura aperta: zero, non un errore', () => {
    expect(contaSenzaData([], indice({}))).toBe(0);
  });
});
