import { describe, it, expect } from 'vitest';
import {
  resolveInfoCampi,
  infoCampiDefault,
  valoreInfo,
  INFO_CAMPI_DISPONIBILI,
  partitionInfoCampi,
} from './infoCampi';

describe('resolveInfoCampi', () => {
  it('snapshot vuoto → tutti gli 11 di default', () => {
    const r = resolveInfoCampi([]);
    expect(r).toHaveLength(11);
    expect(r.map((c) => c.chiave)).toEqual(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));
    expect(r[1]).toMatchObject({ chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 2 });
  });

  it('null/undefined → default', () => {
    expect(resolveInfoCampi(null)).toHaveLength(11);
    expect(resolveInfoCampi(undefined)).toHaveLength(11);
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
  it('produce 11 campi con ordine 1..11', () => {
    const d = infoCampiDefault();
    expect(d).toHaveLength(11);
    expect(d.map((c) => c.ordine)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
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
    expect(dettaglio.map((c) => c.chiave)).toEqual(['matricola', 'pdr', 'odl', 'cap', 'recapito', 'attivita', 'accessibilita']);
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
