import { describe, it, expect } from 'vitest';
import { chiaveSalEffettiva, odlPagatiDaSal, preparaRigheSal, riepilogoUnSal, type SalRigaArricchita } from './salUfficiale';

describe('preparaRigheSal', () => {
  it('mappa i campi e converte le date', () => {
    const out = preparaRigheSal(1, [{
      odl: '957276160', docAcquisti: '4206329130', posizione: '10', valoreAps: 25.46,
      causa: 'EFRE', attivita: 'Limitazione flusso idrico',
      dataCompletamentoRaw: '2026-06-10', dataRegistrazioneRaw: '2026-07-08',
    }]);
    expect(out).toEqual([{
      sal_n: 1, odl: '957276160', doc_acquisti: '4206329130', posizione: '10', valore: 25.46,
      causa: 'EFRE', attivita: 'Limitazione flusso idrico',
      data_completamento: '2026-06-10', data_registrazione: '2026-07-08',
    }]);
  });

  it('scarta le righe senza Ordine', () => {
    expect(preparaRigheSal(1, [{ odl: '', docAcquisti: 'x', posizione: '1', valoreAps: 1 }])).toEqual([]);
  });

  it('dedup per (docAcquisti, posizione), non per odl da solo', () => {
    const grezze = [
      { odl: '1', docAcquisti: 'D1', posizione: '10', valoreAps: 5 },
      { odl: '1', docAcquisti: 'D1', posizione: '10', valoreAps: 5 }, // duplicato esatto -> collassa
      { odl: '1', docAcquisti: 'D1', posizione: '20', valoreAps: 7 }, // stesso odl, posizione diversa -> resta distinta
    ];
    const out = preparaRigheSal(1, grezze);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.posizione).sort()).toEqual(['10', '20']);
  });

  it('valoreAps non numerico -> 0', () => {
    const out = preparaRigheSal(1, [{ odl: '1', docAcquisti: 'd', posizione: '1', valoreAps: NaN }]);
    expect(out[0].valore).toBe(0);
  });
});

describe('riepilogoUnSal', () => {
  const riga = (over: Partial<SalRigaArricchita>): SalRigaArricchita => ({
    sal_n: 1, odl: '1', doc_acquisti: 'd', posizione: '10', valore: 100, causa: 'EFRE',
    attivita: 'X', data_completamento: '2026-06-15', data_registrazione: '2026-07-08',
    valoreListino: 90, ...over,
  });

  it('somma valore APS e listino, calcola il delta', () => {
    const out = riepilogoUnSal([riga({}), riga({ odl: '2', valore: 50, valoreListino: 50 })], new Set(['1', '2']));
    expect(out).toMatchObject({ n: 1, ordini: 2, valoreAps: 150, valoreListino: 140, deltaListino: 10, odlSconosciuti: 0 });
  });

  it('mese = mese completamento più vecchio (min data)', () => {
    const out = riepilogoUnSal([riga({ data_completamento: '2026-06-30' }), riga({ odl: '2', data_completamento: '2026-06-03' })], new Set(['1', '2']));
    expect(out.mese).toBe('2026-06');
  });

  it('mese vuoto se nessuna riga ha data completamento', () => {
    expect(riepilogoUnSal([riga({ data_completamento: null })], new Set(['1'])).mese).toBe('');
  });

  it('conta gli ODL sconosciuti (assenti dal set)', () => {
    const out = riepilogoUnSal([riga({ odl: 'x' })], new Set(['altro']));
    expect(out.odlSconosciuti).toBe(1);
  });

  it('[] -> n=0, tutti gli aggregati a 0', () => {
    expect(riepilogoUnSal([], new Set())).toMatchObject({ n: 0, ordini: 0, valoreAps: 0, valoreListino: 0, deltaListino: 0, odlSconosciuti: 0, mese: '' });
  });
});

describe('odlPagatiDaSal', () => {
  it('set degli ODL, trim, scarta vuoti', () => {
    const s = odlPagatiDaSal([{ odl: ' 1 ' }, { odl: '2' }, { odl: '' }]);
    expect(s).toEqual(new Set(['1', '2']));
  });
});

describe('chiaveSalEffettiva', () => {
  const figli = new Map([['PADRE1', 'FIGLIO1']]);
  it('riga normale -> il proprio odl', () => {
    expect(chiaveSalEffettiva({ odl: '123', attivitaKey: 'LIMITAZIONE' }, 'SARACINESCA', figli)).toBe('123');
  });
  it("saracinesca -> l'odl figlio", () => {
    expect(chiaveSalEffettiva({ odl: 'PADRE1', attivitaKey: 'SARACINESCA' }, 'SARACINESCA', figli)).toBe('FIGLIO1');
  });
  it('saracinesca senza figlio noto -> stringa vuota', () => {
    expect(chiaveSalEffettiva({ odl: 'IGNOTO', attivitaKey: 'SARACINESCA' }, 'SARACINESCA', figli)).toBe('');
  });
});
