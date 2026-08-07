import { describe, it, expect } from 'vitest';
import { anagraficaValida, dettaglioAnagraficaMancante } from './anagraficaValida';

describe('anagraficaValida', () => {
  it('valida: ha identificativo (pdr) e indirizzo (via + comune)', () => {
    expect(anagraficaValida({ pdr: 'PDR1', via: 'Via Roma 1', comune: 'Roma' })).toBe(true);
  });

  it('valida: identificativo tramite odl, indirizzo tramite solo comune', () => {
    expect(anagraficaValida({ odl: 'ODL9', comune: 'Milano' })).toBe(true);
  });

  it('valida: identificativo tramite matricola, indirizzo tramite solo via', () => {
    expect(anagraficaValida({ matricola: 'M001', via: 'Corso Garibaldi 5' })).toBe(true);
  });

  it('non valida: manca identificativo (pdr/odl/matricola tutti vuoti)', () => {
    expect(anagraficaValida({ via: 'Via Roma 1', comune: 'Roma' })).toBe(false);
  });

  it('non valida: manca indirizzo (via e comune entrambi assenti)', () => {
    expect(anagraficaValida({ pdr: 'PDR1' })).toBe(false);
  });

  it('non valida: anagrafica completamente vuota', () => {
    expect(anagraficaValida({})).toBe(false);
  });

  it('non valida: campi presenti ma tutti stringhe vuote', () => {
    expect(anagraficaValida({ pdr: '', odl: '  ', matricola: '', via: '', comune: '  ' })).toBe(false);
  });

  it('lim_massive: basta un identificativo (matricola), indirizzo non obbligatorio', () => {
    expect(anagraficaValida({ matricola: 'AA731024' }, 'lim_massive')).toBe(true);
  });

  it('lim_massive: matricola + comune (senza via) è valida', () => {
    expect(anagraficaValida({ matricola: 'AA731024', comune: 'Zagarolo' }, 'lim_massive')).toBe(true);
  });

  it('lim_massive: senza identificativo resta non valida', () => {
    expect(anagraficaValida({ via: 'Corso Garibaldi 131' }, 'lim_massive')).toBe(false);
  });
});

// La frase deve descrivere la regola APPLICATA. Prima nominava via e comune anche a chi
// l'indirizzo non lo chiede, mandando l'operatore a cercare un campo che nessuno gli domandava.
describe('dettaglioAnagraficaMancante', () => {
  it("lim_massive e acqualatina: solo l'identificativo, nessun accenno all'indirizzo", () => {
    for (const c of ['lim_massive', 'acqualatina']) {
      const m = dettaglioAnagraficaMancante(c);
      expect(m).toMatch(/identificativo/i);
      expect(m).not.toMatch(/indirizzo|via|comune/i);
    }
  });
  it('gli altri committenti: identificativo E indirizzo', () => {
    for (const c of ['acea', 'italgas', 'altro', undefined]) {
      const m = dettaglioAnagraficaMancante(c);
      expect(m).toMatch(/identificativo/i);
      expect(m).toMatch(/indirizzo/i);
    }
  });
  it('la frase resta agganciata a chi la regola esonera davvero', () => {
    // Se un domani `anagraficaValida` cambiasse elenco, questo test cade insieme al messaggio.
    for (const c of ['lim_massive', 'acqualatina', 'acea', 'italgas', 'altro']) {
      const bastaIdentificativo = anagraficaValida({ matricola: '1' }, c);
      expect(dettaglioAnagraficaMancante(c).includes('indirizzo')).toBe(!bastaIdentificativo);
    }
  });
});
