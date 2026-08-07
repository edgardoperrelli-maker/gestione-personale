import { describe, it, expect } from 'vitest';
import { normMatricola, matricoleSimili, matricolaSenzaEnte } from './matricoleSimili';

describe('normMatricola', () => {
  it('maiuscolo e rimuove spazi/trattini/non-alfanumerici', () => {
    expect(normMatricola(' a-023 041 ')).toBe('A023041');
  });
});

describe('matricolaSenzaEnte', () => {
  it('toglie il suffisso ENT', () => {
    expect(matricolaSenzaEnte('14223205ENT')).toBe('14223205');
  });

  it('toglie il suffisso ENTE', () => {
    expect(matricolaSenzaEnte('512370ENTE')).toBe('512370');
  });

  // Il caso che rende obbligatorio l'ordine ENTE→ENT: tagliare «ENT» lascerebbe «124381AE»,
  // una matricola che non esiste. Sono 30+ righe reali dell'anagrafica del 07/08/2026.
  it('sulla matricola che finisce per A toglie ENTE intero, non ENT', () => {
    expect(matricolaSenzaEnte('124381AENTE')).toBe('124381A');
    expect(matricolaSenzaEnte('138474AENTE')).toBe('138474A');
  });

  it('vale anche sulle matricole che iniziano con lettere', () => {
    expect(matricolaSenzaEnte('AL014451ENT')).toBe('AL014451');
    expect(matricolaSenzaEnte('GN71128ENTE')).toBe('GN71128');
  });

  it('lascia intatta una matricola pulita', () => {
    expect(matricolaSenzaEnte('202015210663')).toBe('202015210663');
    expect(matricolaSenzaEnte('113202A')).toBe('113202A');
  });

  it('minuscolo e spazi di bordo non salvano il suffisso', () => {
    expect(matricolaSenzaEnte('  14223205ent  ')).toBe('14223205');
  });

  // Una cella che vale solo «ENTE» è un'intestazione finita fra i dati: si tiene com'è, così la
  // riga resta visibile invece di sparire fra le scartate senza matricola.
  it('non svuota il valore quando resterebbe una stringa vuota', () => {
    expect(matricolaSenzaEnte('ENTE')).toBe('ENTE');
    expect(matricolaSenzaEnte('ENT')).toBe('ENT');
  });

  it('valore assente → stringa vuota', () => {
    expect(matricolaSenzaEnte(null)).toBe('');
    expect(matricolaSenzaEnte(undefined)).toBe('');
  });
});

describe('matricoleSimili', () => {
  const db = (...m: string[]) => m.map((matricola) => ({ matricola }));

  it('prefisso variabile: A023041 suggerisce 99A023041', () => {
    const r = matricoleSimili('A023041', db('99A023041', 'B999999'));
    expect(r.map((x) => x.matricola)).toEqual(['99A023041']);
  });

  it('caso inverso: 99A023041 suggerisce A023041', () => {
    const r = matricoleSimili('99A023041', db('A023041'));
    expect(r.map((x) => x.matricola)).toEqual(['A023041']);
  });

  it('ordina esatto > suffisso > prefisso > contenimento', () => {
    const r = matricoleSimili('A023041', db('XA023041Y', '99A023041', 'A023041', 'A023041Z'));
    expect(r.map((x) => x.matricola)).toEqual(['A023041', '99A023041', 'A023041Z', 'XA023041Y']);
  });

  it('query troppo corta (<4) → nessun suggerimento', () => {
    expect(matricoleSimili('A02', db('99A023041'))).toEqual([]);
  });

  it('taglia a max (default 8)', () => {
    const many = db(...Array.from({ length: 20 }, (_, i) => `A023041_${i}`));
    expect(matricoleSimili('A023041', many)).toHaveLength(8);
  });
});
