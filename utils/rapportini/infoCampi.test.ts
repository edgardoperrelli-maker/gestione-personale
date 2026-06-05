import { describe, it, expect } from 'vitest';
import {
  resolveInfoCampi,
  infoCampiDefault,
  valoreInfo,
  INFO_CAMPI_DISPONIBILI,
  partitionInfoCampi,
  titoloVoce,
  coordinateFromRaw,
} from './infoCampi';

describe('resolveInfoCampi', () => {
  it('snapshot vuoto → tutti i 12 di default', () => {
    const r = resolveInfoCampi([]);
    expect(r).toHaveLength(12);
    expect(r.map((c) => c.chiave)).toEqual(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));
    expect(r[1]).toMatchObject({ chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 2 });
  });

  it('null/undefined → default', () => {
    expect(resolveInfoCampi(null)).toHaveLength(12);
    expect(resolveInfoCampi(undefined)).toHaveLength(12);
  });

  it('ordina per ordine e rispetta le etichette custom', () => {
    const r = resolveInfoCampi([
      { chiave: 'matricola', etichetta: 'MATR. CONTATORE', ordine: 2 },
      { chiave: 'via', etichetta: 'INDIRIZZO', ordine: 1 },
    ]);
    expect(r.map((c) => c.chiave)).toEqual(['via', 'matricola']);
    expect(r[0].etichetta).toBe('INDIRIZZO');
    expect(r[1].etichetta).toBe('MATR. CONTATORE');
  });

  it('ignora chiavi sconosciute', () => {
    const r = resolveInfoCampi([
      { chiave: 'matricola', etichetta: 'M', ordine: 1 },
      { chiave: 'fantasia' as never, etichetta: 'X', ordine: 2 },
    ]);
    expect(r.map((c) => c.chiave)).toEqual(['matricola']);
  });

  it('etichetta vuota → default della chiave', () => {
    const r = resolveInfoCampi([{ chiave: 'cap', etichetta: '  ', ordine: 1 }]);
    expect(r[0].etichetta).toBe('CAP');
  });

  it('alias legacy: chiave "odsin" viene normalizzata a "odl"', () => {
    const r = resolveInfoCampi([{ chiave: 'odsin' as never, etichetta: 'ODSIN', ordine: 1 }]);
    expect(r).toHaveLength(1);
    expect(r[0].chiave).toBe('odl');
    expect(r[0].etichetta).toBe('ODSIN'); // l'etichetta salvata viene conservata
  });
});

describe('infoCampiDefault', () => {
  it('produce 12 campi con ordine 1..12', () => {
    const d = infoCampiDefault();
    expect(d).toHaveLength(12);
    expect(d.map((c) => c.ordine)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('valoreInfo', () => {
  it('estrae e trimma; null → stringa vuota', () => {
    expect(valoreInfo({ matricola: ' M1 ' }, 'matricola')).toBe('M1');
    expect(valoreInfo({ matricola: null }, 'matricola')).toBe('');
    expect(valoreInfo({}, 'pdr')).toBe('');
  });
});

describe('partitionInfoCampi', () => {
  it('separa primari e dettaglio dallo snapshot di default', () => {
    const { primari, dettaglio } = partitionInfoCampi([]);
    expect(primari.map((c) => c.chiave)).toEqual(['nominativo', 'via', 'comune', 'fascia_oraria']);
    expect(dettaglio.map((c) => c.chiave)).toEqual(['matricola', 'pdr', 'odl', 'cap', 'recapito', 'attivita', 'accessibilita', 'coordinate']);
  });
  it('rispetta i campi mancanti nello snapshot', () => {
    const { primari, dettaglio } = partitionInfoCampi([
      { chiave: 'nominativo', etichetta: 'N', ordine: 1 },
      { chiave: 'pdr', etichetta: 'P', ordine: 2 },
    ]);
    expect(primari.map((c) => c.chiave)).toEqual(['nominativo']);
    expect(dettaglio.map((c) => c.chiave)).toEqual(['pdr']);
  });
  it('ordina il dettaglio per ordine', () => {
    const { dettaglio } = partitionInfoCampi([
      { chiave: 'cap', etichetta: 'CAP', ordine: 2 },
      { chiave: 'pdr', etichetta: 'PDR', ordine: 1 },
    ]);
    expect(dettaglio.map((c) => c.chiave)).toEqual(['pdr', 'cap']);
  });
});

describe('titoloVoce', () => {
  it('titoloCampi vuoto → nominativo, poi pdr, poi "Voce N"', () => {
    expect(titoloVoce({ nominativo: 'ROSSI MARIO' }, [], 0)).toBe('ROSSI MARIO');
    expect(titoloVoce({ pdr: 'PDR1' }, [], 0)).toBe('PDR1');
    expect(titoloVoce({}, [], 4)).toBe('Voce 5');
  });
  it('usa il primo campo NON vuoto della lista di priorità', () => {
    expect(titoloVoce({ odl: 'ODL9', via: 'Via Roma' }, ['odl', 'via'], 0)).toBe('ODL9');
    expect(titoloVoce({ via: 'Via Roma' }, ['odl', 'via'], 0)).toBe('Via Roma');
  });
  it('lista configurata con tutti i campi vuoti → "Voce N" (niente fallback a nominativo)', () => {
    expect(titoloVoce({ nominativo: 'IGNORATO' }, ['odl', 'via'], 2)).toBe('Voce 3');
  });
});

describe('coordinateFromRaw', () => {
  it('estrae la coordinata dal raw_json', () => {
    expect(coordinateFromRaw({ coordinate: '41.853675, 12.7888783' })).toBe('41.853675, 12.7888783');
  });
  it('assente/vuota/non-stringa → undefined', () => {
    expect(coordinateFromRaw({})).toBeUndefined();
    expect(coordinateFromRaw({ coordinate: '' })).toBeUndefined();
    expect(coordinateFromRaw(null)).toBeUndefined();
    expect(coordinateFromRaw({ coordinate: 123 })).toBeUndefined();
  });
});

describe('campo coordinate', () => {
  it('coordinate è tra i campi info disponibili', () => {
    expect(INFO_CAMPI_DISPONIBILI.some((c) => c.chiave === 'coordinate')).toBe(true);
  });
  it('valoreInfo legge coordinate dalla voce', () => {
    expect(valoreInfo({ coordinate: '41.85, 12.78' }, 'coordinate')).toBe('41.85, 12.78');
  });
});
