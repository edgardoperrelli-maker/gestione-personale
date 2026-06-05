// utils/rapportini/datiRiepilogoPdf.test.ts
import { describe, it, expect } from 'vitest';
import { costruisciDatiPdf, motivoNonEseguito, valoreCampo } from './datiRiepilogoPdf';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 2 },
  { chiave: 'assente', etichetta: 'Cliente assente', tipo: 'crocetta', ordine: 3 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
];

describe('motivoNonEseguito', () => {
  it('usa la nota se presente (trim)', () => {
    expect(motivoNonEseguito({ note: '  Cancello chiuso ' })).toBe('Cancello chiuso');
  });
  it('senza nota valida → "Assente"', () => {
    expect(motivoNonEseguito({})).toBe('Assente');
    expect(motivoNonEseguito({ note: '   ' })).toBe('Assente');
    expect(motivoNonEseguito({ note: 42 })).toBe('Assente');
  });
});

describe('valoreCampo', () => {
  it('crocetta true → "X", altrimenti vuoto', () => {
    expect(valoreCampo({ cambio: true }, campi[1])).toBe('X');
    expect(valoreCampo({}, campi[1])).toBe('');
  });
  it('testo/select → valore stringa (trim)', () => {
    expect(valoreCampo({ eseguito: 'SI' }, campi[0])).toBe('SI');
    expect(valoreCampo({ note: '  ciao ' }, campi[3])).toBe('ciao');
    expect(valoreCampo({}, campi[3])).toBe('');
  });
});

describe('costruisciDatiPdf', () => {
  const voci = [
    { nominativo: 'Esposito Anna', pdr: '111', via: 'Via Toledo 45', comune: 'Napoli', attivita: 'Sost.', risposte: { eseguito: 'SI', cambio: true } },
    { nominativo: 'Conte Rosa', pdr: '222', via: 'Via Diaz 22', comune: 'Napoli', attivita: 'Sost.', risposte: { assente: true } },
    { nominativo: 'Gallo Sara', pdr: '333', via: 'Via Petrarca 3', comune: 'Napoli', attivita: 'Verifica', risposte: { assente: true, note: 'Impianto non accessibile' } },
  ];
  const dati = costruisciDatiPdf({ staffName: 'Mario Rossi', dataLabel: '04/06/2026', voci, campi });

  it('conteggi corretti', () => {
    expect(dati.stats).toEqual({ totali: 3, eseguiti: 1, nonEseguiti: 2 });
  });
  it('separa eseguiti/non eseguiti con numerazione globale', () => {
    expect(dati.eseguiti.map((r) => r.n)).toEqual([1]);
    expect(dati.nonEseguiti.map((r) => r.n)).toEqual([2, 3]);
  });
  it('indirizzo = via · comune', () => {
    expect(dati.eseguiti[0].indirizzo).toBe('Via Toledo 45 · Napoli');
  });
  it('motivo = nota oppure "Assente"', () => {
    expect(dati.nonEseguiti[0].motivo).toBe('Assente');
    expect(dati.nonEseguiti[1].motivo).toBe('Impianto non accessibile');
  });
  it('lavorazioni escludono i marcatori "assente"', () => {
    expect(dati.lavorazioni).toEqual([{ etichetta: 'CAMBIO', count: 1 }]);
  });
  it('colonne = campi del template in ordine', () => {
    expect(dati.colonne.map((c) => c.etichetta)).toEqual(['Eseguito', 'CAMBIO', 'Cliente assente', 'Note']);
  });
  it('valori campi per riga allineati alle colonne', () => {
    expect(dati.eseguiti[0].campi).toEqual(['SI', 'X', '', '']);
    expect(dati.nonEseguiti[1].campi).toEqual(['', '', 'X', 'Impianto non accessibile']);
  });
});
