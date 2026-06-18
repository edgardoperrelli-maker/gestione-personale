import { describe, it, expect } from 'vitest';
import { estraiPianificabili } from './pianificabili.mjs';

const base = (over: Record<string, unknown> = {}) => ({
  riga: 2, odl: '912', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO',
  esecutore: 'CIARALLO', dataRaw: '2026-06-19', esitoRaw: '', ...over,
});

describe('estraiPianificabili', () => {
  it('tiene solo data==target + esecutore presente + esito vuoto', () => {
    const out = estraiPianificabili([
      base(),
      base({ riga: 3, dataRaw: '2026-06-20' }),            // altra data
      base({ riga: 4, esecutore: '' }),                    // senza esecutore
      base({ riga: 5, esitoRaw: 'eseguito' }),             // già lavorata
    ], '2026-06-19');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ riga: 2, odl: '912', matricola: 'M1', indirizzo: 'VIA X', comune: 'ZAGAROLO', data: '2026-06-19', esecutore: 'CIARALLO' });
  });
  it('normalizza la data via giornoDa (accetta Date/locale)', () => {
    const out = estraiPianificabili([base({ dataRaw: new Date('2026-06-19T00:00:00') })], '2026-06-19');
    expect(out).toHaveLength(1);
  });
});
