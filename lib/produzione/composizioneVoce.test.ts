import { describe, expect, it } from 'vitest';
import { composizionePerVoce, VOCE_LABEL } from './composizioneVoce';
import type { ProduzioneAggregata } from './aggregaProduzione';

const base: ProduzioneAggregata = {
  totale: { conteggio: 0, valore: 0 },
  perVoce: [],
  perAttivita: [],
  perOperatore: [],
  perTerritorio: [],
  perGiorno: [],
  nonRisolte: 0,
};

describe('composizionePerVoce', () => {
  it('rietichetta le voci note', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'EL', label: 'EL', conteggio: 3, valore: 60 }],
    });
    expect(out).toEqual([{ chiave: 'EL', label: VOCE_LABEL.EL, conteggio: 3, valore: 60 }]);
  });

  it('estrae le saracinesche da NON_RISOLTA come fetta a sé', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [
        { chiave: 'EL', label: 'EL', conteggio: 2, valore: 40 },
        { chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 10, valore: 950 },
      ],
      perAttivita: [{ chiave: 'SOSTITUZIONE SARACINESCA', label: 'Sostituzione saracinesca', conteggio: 9, valore: 900 }],
    });
    expect(out).toEqual([
      { chiave: 'EL', label: VOCE_LABEL.EL, conteggio: 2, valore: 40 },
      { chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: 9, valore: 900 },
      { chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: 1, valore: 50 },
    ]);
  });

  it('se NON_RISOLTA è tutta saracinesca, il residuo sparisce', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 5, valore: 455 }],
      perAttivita: [{ chiave: 'SOSTITUZIONE SARACINESCA', label: 'Sostituzione saracinesca', conteggio: 5, valore: 455 }],
    });
    expect(out).toEqual([{ chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: 5, valore: 455 }]);
  });

  it('senza saracinesche NON_RISOLTA resta intatta', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 2, valore: 10 }],
    });
    expect(out).toEqual([{ chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: 2, valore: 10 }]);
  });

  it('estrae le riattivazioni/revoche (2 attività canoniche) da NON_RISOLTA come fetta unica', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 10, valore: 288.1 }],
      perAttivita: [
        { chiave: 'RIATTIVAZIONE UTENZA', label: 'Riattivazione utenza', conteggio: 7, valore: 201.67 },
        { chiave: 'REVOCA DISTACCO RIATTIVAZIONE', label: 'Revoca Distacco Riattivazione', conteggio: 2, valore: 57.62 },
      ],
    });
    expect(out).toEqual([
      { chiave: 'RIATTIVAZIONE', label: VOCE_LABEL.RIATTIVAZIONE, conteggio: 9, valore: 259.29 },
      { chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: 1, valore: 28.81 },
    ]);
  });

  it('estrae saracinesche e riattivazioni insieme, nell’ordine saracinesche → riattivazioni → residuo', () => {
    const out = composizionePerVoce({
      ...base,
      perVoce: [{ chiave: 'NON_RISOLTA', label: 'NON_RISOLTA', conteggio: 20, valore: 1000 }],
      perAttivita: [
        { chiave: 'SOSTITUZIONE SARACINESCA', label: 'Sostituzione saracinesca', conteggio: 5, valore: 455.6 },
        { chiave: 'RIATTIVAZIONE UTENZA', label: 'Riattivazione utenza', conteggio: 10, valore: 288.1 },
      ],
    });
    expect(out).toEqual([
      { chiave: 'SARACINESCA', label: VOCE_LABEL.SARACINESCA, conteggio: 5, valore: 455.6 },
      { chiave: 'RIATTIVAZIONE', label: VOCE_LABEL.RIATTIVAZIONE, conteggio: 10, valore: 288.1 },
      { chiave: 'NON_RISOLTA', label: VOCE_LABEL.NON_RISOLTA, conteggio: 5, valore: 256.3 },
    ]);
  });
});
