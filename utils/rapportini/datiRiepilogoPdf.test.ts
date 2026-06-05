// utils/rapportini/datiRiepilogoPdf.test.ts
import { describe, it, expect } from 'vitest';
import { costruisciDatiPdf, valoreCampo } from './datiRiepilogoPdf';
import type { TemplateCampo } from './buildVoci';
import type { TemplateInfoCampo } from './infoCampi';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 2 },
  { chiave: 'assente', etichetta: 'Cliente assente', tipo: 'crocetta', ordine: 3 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
];

// Template SENZA pdr, CON odl → la colonna PDR non deve comparire, ODS/ODL sì.
const infoCampi: TemplateInfoCampo[] = [
  { chiave: 'nominativo', etichetta: 'NOMINATIVO', ordine: 1 },
  { chiave: 'odl', etichetta: 'ODS/ODL', ordine: 2 },
  { chiave: 'via', etichetta: 'VIA', ordine: 3 },
  { chiave: 'comune', etichetta: 'COMUNE', ordine: 4 },
];

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
    { nominativo: 'Esposito Anna', odl: 'ODL-100', pdr: '111', via: 'Via Toledo 45', comune: 'Napoli', risposte: { eseguito: 'SI', cambio: true } },
    { nominativo: 'Conte Rosa', odl: 'ODL-200', pdr: '222', via: 'Via Diaz 22', comune: 'Napoli', risposte: { assente: true } },
    { nominativo: 'Gallo Sara', odl: 'ODL-300', pdr: '333', via: 'Via Petrarca 3', comune: 'Napoli', risposte: { assente: true, note: 'Impianto non accessibile' } },
  ];
  const dati = costruisciDatiPdf({ staffName: 'Mario Rossi', dataLabel: '04/06/2026', voci, campi, infoCampi });

  it('conteggi corretti', () => {
    expect(dati.stats).toEqual({ totali: 3, eseguiti: 1, nonEseguiti: 2 });
  });
  it('colonne = info del template + campi; niente PDR, presente ODS/ODL', () => {
    expect(dati.colonne.map((c) => c.etichetta)).toEqual([
      'NOMINATIVO', 'ODS/ODL', 'VIA', 'COMUNE', 'Eseguito', 'CAMBIO', 'Cliente assente', 'Note',
    ]);
    expect(dati.colonne.map((c) => c.etichetta)).not.toContain('PDR');
  });
  it('flag crocetta sulle colonne giuste', () => {
    const byLabel = Object.fromEntries(dati.colonne.map((c) => [c.etichetta, c.crocetta]));
    expect(byLabel['CAMBIO']).toBe(true);
    expect(byLabel['NOMINATIVO']).toBe(false);
    expect(byLabel['Note']).toBe(false);
  });
  it('valori riga allineati alle colonne (info poi campi)', () => {
    expect(dati.eseguiti[0].valori).toEqual(['Esposito Anna', 'ODL-100', 'Via Toledo 45', 'Napoli', 'SI', 'X', '', '']);
    expect(dati.nonEseguiti[1].valori).toEqual(['Gallo Sara', 'ODL-300', 'Via Petrarca 3', 'Napoli', '', '', 'X', 'Impianto non accessibile']);
  });
  it('lavorazioni escludono i marcatori "assente"', () => {
    expect(dati.lavorazioni).toEqual([{ etichetta: 'CAMBIO', count: 1 }]);
  });
  it('numerazione globale eseguiti/non eseguiti', () => {
    expect(dati.eseguiti.map((r) => r.n)).toEqual([1]);
    expect(dati.nonEseguiti.map((r) => r.n)).toEqual([2, 3]);
  });
});
