import { describe, expect, it } from 'vitest';
import { composizionePerVoce, PREFISSO_COMMESSA, VOCE_LABEL } from './composizioneVoce';
import type { ProduzioneAggregata } from './aggregaProduzione';

const base: ProduzioneAggregata = {
  totale: { conteggio: 0, valore: 0 },
  perVoce: [],
  perAttivita: [],
  perOperatore: [],
  perTerritorio: [],
  perGiorno: [],
  perCommessa: [],
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

  it('una commessa senza voci ha una fetta sua, col suo nome', () => {
    /*
      Le righe AcquaLatina non hanno una voce ACEA e non ne avranno mai: arrivano già raggruppate
      sotto la loro commessa (vedi `gruppoVoce` in load.ts). Qui si controlla che l'etichetta sia
      il nome del committente e non la chiave tecnica «COMMESSA:acqualatina».
    */
    const out = composizionePerVoce({
      ...base,
      perVoce: [
        { chiave: 'EL', label: 'EL', conteggio: 2, valore: 40 },
        { chiave: `${PREFISSO_COMMESSA}acqualatina`, label: 'x', conteggio: 263, valore: 5846.49 },
      ],
    });
    expect(out).toEqual([
      { chiave: 'EL', label: VOCE_LABEL.EL, conteggio: 2, valore: 40 },
      { chiave: `${PREFISSO_COMMESSA}acqualatina`, label: 'AcquaLatina', conteggio: 263, valore: 5846.49 },
    ]);
  });
});
