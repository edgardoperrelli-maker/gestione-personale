import { describe, it, expect } from 'vitest';
import { parseFiltriRef } from './filtriRef';

describe('parseFiltriRef', () => {
  it('estrae e trimma i filtri', () => {
    const f = parseFiltriRef(new URLSearchParams('indirizzo=%20Via%20Roma%20&civico=24&comune=Napoli&import_id=abc'));
    expect(f).toEqual({ indirizzo: 'Via Roma', civico: '24', comune: 'Napoli', import_id: 'abc', vuoto: false });
  });

  it('vuoto true quando nessun filtro presente', () => {
    expect(parseFiltriRef(new URLSearchParams('')).vuoto).toBe(true);
    expect(parseFiltriRef(new URLSearchParams('indirizzo=%20%20')).vuoto).toBe(true);
  });

  it('vuoto false se almeno un filtro valorizzato', () => {
    expect(parseFiltriRef(new URLSearchParams('civico=3')).vuoto).toBe(false);
    expect(parseFiltriRef(new URLSearchParams('import_id=x')).vuoto).toBe(false);
  });
});
