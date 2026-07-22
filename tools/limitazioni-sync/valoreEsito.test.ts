// tools/limitazioni-sync/valoreEsito.test.ts
// Il testo scritto nella cella esito del master: config (eseguito/No) di default,
// ma l'export può imporre un testo specifico (oggi "nessun passaggio") che sui
// negativi batte il "No" generico — scritto secco travisava l'esito reale.
import { describe, it, expect } from 'vitest';
import { valoreEsito } from './agente.mjs';

const POS = 'eseguito';
const NEG = 'No';

describe('valoreEsito', () => {
  it('positivo → testo config positivo', () => {
    expect(valoreEsito({ esitoOk: true }, POS, NEG)).toBe(POS);
  });
  it('negativo senza esitoTesto → testo config negativo (export vecchio compatibile)', () => {
    expect(valoreEsito({ esitoOk: false }, POS, NEG)).toBe(NEG);
    expect(valoreEsito({ esitoOk: false, esitoTesto: null }, POS, NEG)).toBe(NEG);
    expect(valoreEsito({ esitoOk: false, esitoTesto: '   ' }, POS, NEG)).toBe(NEG);
  });
  it('negativo con esitoTesto → il testo specifico batte il "No" generico', () => {
    expect(valoreEsito({ esitoOk: false, esitoTesto: 'nessun passaggio' }, POS, NEG)).toBe('nessun passaggio');
    expect(valoreEsito({ esitoOk: false, esitoTesto: ' nessun passaggio ' }, POS, NEG)).toBe('nessun passaggio');
  });
  it('non lavorato → null (non scrive)', () => {
    expect(valoreEsito({ esitoOk: null, esitoTesto: 'nessun passaggio' }, POS, NEG)).toBeNull();
  });
});
