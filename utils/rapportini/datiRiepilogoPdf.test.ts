// utils/rapportini/datiRiepilogoPdf.test.ts
import { describe, it, expect } from 'vitest';
import { costruisciDatiPdf, valoreCampo } from './datiRiepilogoPdf';
import { campiEsportabili, type TemplateCampo } from './buildVoci';
import type { TemplateInfoCampo } from './infoCampi';

// Template tipo ACEA: una crocetta + un select (saracinesca SI/NO) + assente + note.
const campi: TemplateCampo[] = [
  { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 1 },
  { chiave: 'saracinesca', etichetta: 'SOST. SARACINESCA', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 2 },
  { chiave: 'assente', etichetta: 'Cliente assente', tipo: 'crocetta', ordine: 3 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
  { chiave: 'foto_contatore', etichetta: 'FOTO CONTATORE', tipo: 'foto', obbligatoria: true, ordine: 5 },
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
    expect(valoreCampo({ cambio: true }, campi[0])).toBe('X');
    expect(valoreCampo({}, campi[0])).toBe('');
  });
  it('select affermativo "SI" → "X"; negativo "NO" resta; testo invariato', () => {
    expect(valoreCampo({ saracinesca: 'SI' }, campi[1])).toBe('X');
    expect(valoreCampo({ saracinesca: 'NO' }, campi[1])).toBe('NO');
    expect(valoreCampo({ note: '  ciao ' }, campi[3])).toBe('ciao');
    expect(valoreCampo({}, campi[1])).toBe('');
  });
  it('booleano true → "X" anche su campo non-crocetta (voci manuali dal +)', () => {
    expect(valoreCampo({ saracinesca: true }, campi[1])).toBe('X');
    expect(valoreCampo({ saracinesca: false }, campi[1])).toBe('');
  });
});

describe('campiEsportabili', () => {
  it('esclude i campi foto dagli export', () => {
    expect(campiEsportabili(campi).map((c) => c.chiave)).toEqual(['cambio', 'saracinesca', 'assente', 'note']);
  });
});

describe('costruisciDatiPdf', () => {
  const voci = [
    { nominativo: 'Esposito Anna', odl: 'ODL-100', pdr: '111', via: 'Via Toledo 45', comune: 'Napoli', risposte: { cambio: true, saracinesca: 'SI', foto_contatore: 'https://x/p.jpg' } },
    { nominativo: 'Russo Luigi', odl: 'ODL-200', pdr: '222', via: 'Via Chiaia 12', comune: 'Napoli', risposte: { saracinesca: 'SI' } },
    { nominativo: 'Conte Rosa', odl: 'ODL-300', pdr: '333', via: 'Via Diaz 22', comune: 'Napoli', risposte: { assente: true } },
    { nominativo: 'Gallo Sara', odl: 'ODL-400', pdr: '444', via: 'Via Petrarca 3', comune: 'Napoli', risposte: { saracinesca: 'NO', note: 'Valvola bloccata' } },
  ];
  const dati = costruisciDatiPdf({ staffName: 'Mario Rossi', dataLabel: '04/06/2026', voci, campi, infoCampi });

  it('conteggi corretti (select SI = eseguito, select NO/assente = non eseguito)', () => {
    expect(dati.stats).toEqual({ totali: 4, eseguiti: 2, nonEseguiti: 2 });
  });
  it('barre lavorazioni: crocette + select positivi (saracinesca SI), escluso assente', () => {
    expect(dati.lavorazioni).toEqual([
      { etichetta: 'CAMBIO', count: 1 },
      { etichetta: 'SOST. SARACINESCA', count: 2 },
    ]);
  });
  it('colonne = info del template + campi; niente PDR, presente ODS/ODL, niente colonne FOTO', () => {
    expect(dati.colonne.map((c) => c.etichetta)).toEqual([
      'NOMINATIVO', 'ODS/ODL', 'VIA', 'COMUNE', 'CAMBIO', 'SOST. SARACINESCA', 'Cliente assente', 'Note',
    ]);
    expect(dati.colonne.map((c) => c.etichetta)).not.toContain('PDR');
    expect(dati.colonne.map((c) => c.etichetta)).not.toContain('FOTO CONTATORE');
  });
  it('valori riga allineati alle colonne (info poi campi)', () => {
    expect(dati.eseguiti[0].valori).toEqual(['Esposito Anna', 'ODL-100', 'Via Toledo 45', 'Napoli', 'X', 'X', '', '']);
    expect(dati.nonEseguiti[1].valori).toEqual(['Gallo Sara', 'ODL-400', 'Via Petrarca 3', 'Napoli', '', 'NO', '', 'Valvola bloccata']);
  });
  it('numerazione globale eseguiti/non eseguiti', () => {
    expect(dati.eseguiti.map((r) => r.n)).toEqual([1, 2]);
    expect(dati.nonEseguiti.map((r) => r.n)).toEqual([3, 4]);
  });
});

describe('costruisciDatiPdf — voci manuali (dal +)', () => {
  // Nel template pianificato 'sostituzione_valvola' è un select SI/NO; le voci manuali
  // la salvano come booleano true e con chiavi diverse dal pianificato.
  const campiM: TemplateCampo[] = [
    { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  ];
  const voci = [
    { matricola: 'M1', via: 'Via A', risposte: { sostituzione_valvola: 'SI' } },                  // task
    { matricola: 'M2', via: 'Via B', manuale: true, risposte: { sostituzione_valvola: true } },   // manuale (booleano)
    { matricola: 'M3', via: 'Via C', manuale: true, risposte: { lettura: '5' } },                 // manuale senza esito
  ];
  const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiM, infoCampi: null });

  it('ogni voce manuale finisce in "Eseguiti" (riga presente nel PDF)', () => {
    expect(dati.eseguiti.length).toBe(3);
    expect(dati.nonEseguiti.length).toBe(0);
  });
  it('il conteggio lavorazione include sia "SI" sia il booleano true', () => {
    expect(dati.lavorazioni).toEqual([{ etichetta: 'SOSTITUZIONE VALVOLA', count: 2 }]);
  });
});
