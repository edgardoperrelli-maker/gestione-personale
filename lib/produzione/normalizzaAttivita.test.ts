import { describe, expect, it } from 'vitest';
import { normalizzaAttivita } from './normalizzaAttivita';

describe('normalizzaAttivita', () => {
  it('chiave = MAIUSCOLO senza accenti/spazi doppi; etichetta = testo pulito', () => {
    expect(normalizzaAttivita('Limitazione flusso idrico')).toEqual({
      key: 'LIMITAZIONE FLUSSO IDRICO',
      etichetta: 'Limitazione flusso idrico',
    });
    expect(normalizzaAttivita('  Rim Mis/Mod  radio  ')).toEqual({
      key: 'RIM MIS/MOD RADIO',
      etichetta: 'Rim Mis/Mod radio',
    });
    expect(normalizzaAttivita('Regolarizzazióne')).toEqual({
      key: 'REGOLARIZZAZIONE',
      etichetta: 'Regolarizzazióne',
    });
  });

  it('vuoto/nullable → null', () => {
    expect(normalizzaAttivita('')).toBeNull();
    expect(normalizzaAttivita('   ')).toBeNull();
    expect(normalizzaAttivita(null)).toBeNull();
    expect(normalizzaAttivita(undefined)).toBeNull();
  });
});
