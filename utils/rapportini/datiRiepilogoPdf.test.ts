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

describe('costruisciDatiPdf — blindatura barra "Eseguito" voci manuali (regressione PLENZICH: 45 ≠ 32)', () => {
  // Template tipo PLENZICH: "eseguito" è un SELECT (SI/NO), non una crocetta.
  // Una voce manuale (dal "+") è SEMPRE eseguita, ma se il template solo_manuale del committente
  // non dichiara il campo `eseguito`, il default a creazione (esitoPositivoDefault) non scatta e la
  // voce viene salvata SENZA `eseguito`. Deve comunque contare nella barra "Eseguito" e mostrare "X".
  const campiP: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
    { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI'], ordine: 2 },
    { chiave: 'lettura', etichetta: 'LETTURA', tipo: 'testo', ordine: 3 },
  ];
  const voci = [
    { matricola: 'P1', via: 'Via 1', risposte: { eseguito: 'SI' } },                                            // pianificata eseguita
    { matricola: 'P2', via: 'Via 2', risposte: { eseguito: 'NO' } },                                            // pianificata NON eseguita
    { matricola: 'M1', via: 'Via 3', manuale: true, risposte: { eseguito: 'SI', sostituzione_valvola: 'SI' } }, // manuale col campo
    { matricola: 'M2', via: 'Via 4', manuale: true, risposte: { lettura: '5' } },                               // manuale SENZA `eseguito` ← bug
  ];
  const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiP, infoCampi: null });

  it('stato: le manuali sono eseguite anche senza il campo `eseguito` salvato', () => {
    expect(dati.stats).toEqual({ totali: 4, eseguiti: 3, nonEseguiti: 1 });
  });
  it('la barra "Eseguito" conta TUTTE le eseguite (= stats.eseguiti), non solo quelle col campo valorizzato', () => {
    const eseguito = dati.lavorazioni.find((l) => l.etichetta === 'Eseguito');
    expect(eseguito?.count).toBe(3);
    expect(eseguito?.count).toBe(dati.stats.eseguiti);
    // SOSTITUZIONE VALVOLA non deve gonfiarsi con le manuali: conta solo dove davvero svolta.
    expect(dati.lavorazioni.find((l) => l.etichetta === 'SOSTITUZIONE VALVOLA')?.count).toBe(1);
  });
  it('la cella "Eseguito" della voce manuale senza campo mostra "X" (coerente col conteggio)', () => {
    const idxEseguito = dati.colonne.findIndex((c) => c.etichetta === 'Eseguito');
    const idxLettura = dati.colonne.findIndex((c) => c.etichetta === 'LETTURA');
    const rigaM2 = dati.eseguiti.find((r) => r.valori[idxLettura] === '5');
    expect(rigaM2?.valori[idxEseguito]).toBe('X');
  });

  it('le voci RIFIUTATE sono scartate da stats, liste e lavorazioni', () => {
    const vociR = [
      { matricola: 'A', via: 'V', manuale: true, approvazione_stato: 'approvato', risposte: { eseguito: 'SI' } },
      { matricola: 'B', via: 'V', manuale: true, approvazione_stato: 'rifiutato', risposte: {} },
      { matricola: 'C', via: 'V', manuale: true, approvazione_stato: 'rifiutato', risposte: { eseguito: 'SI' } },
    ];
    const d = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci: vociR, campi: campiP, infoCampi: null });
    expect(d.stats).toEqual({ totali: 1, eseguiti: 1, nonEseguiti: 0 });
    expect(d.eseguiti.length).toBe(1);
    expect(d.lavorazioni.find((l) => l.etichetta === 'Eseguito')?.count).toBe(1);
  });
});

describe('costruisciDatiPdf — le voci NON compilate (da_fare) NON spariscono dal PDF', () => {
  // Regressione operativa: i rapportini stampati prima della compilazione, o su template senza
  // campo `eseguito` (es. BONIFICHE EXTRA), avevano tutte le voci `da_fare` → il corpo del PDF
  // restava VUOTO pur con N interventi nell'header. Ogni intervento deve comparire (con via/comune/attività).
  const campiD: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  ];
  const voci = [
    { matricola: 'A', via: 'Via A', comune: 'Roma', risposte: { eseguito: 'SI' } },  // eseguito
    { matricola: 'B', via: 'Via B', comune: 'Roma', risposte: { eseguito: 'NO' } },  // non eseguito
    { matricola: 'C', via: 'Via C', comune: 'Roma', risposte: {} },                  // non compilata → da fare
  ];
  const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiD, infoCampi: null });

  it('le voci non compilate finiscono in `daFare`, non scartate', () => {
    expect(dati.eseguiti.length).toBe(1);
    expect(dati.nonEseguiti.length).toBe(1);
    expect(dati.daFare.length).toBe(1);
  });
  it('nessun intervento sparisce: somma righe = totale voci', () => {
    expect(dati.eseguiti.length + dati.nonEseguiti.length + dati.daFare.length).toBe(3);
    expect(dati.stats.totali).toBe(3);
  });
  it('la riga `da fare` porta con sé i suoi dati (via)', () => {
    expect(dati.daFare[0].valori).toContain('Via C');
  });
});

describe('costruisciDatiPdf — template senza campo `eseguito` (BONIFICHE EXTRA)', () => {
  const campiB: TemplateCampo[] = [
    { chiave: 'bonifica_semplice', etichetta: 'BONIFICA SEMPLICE', tipo: 'crocetta', ordine: 1 },
  ];
  const voci = [
    { matricola: 'X1', via: 'Via 1', comune: 'Subiaco', attivita: 'BONIFICHE EXTRA', risposte: {} },                       // non compilata
    { matricola: 'X2', via: 'Via 2', comune: 'Subiaco', attivita: 'BONIFICHE EXTRA', risposte: { bonifica_semplice: true } }, // svolta → verde
  ];
  const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiB, infoCampi: null });

  it('la voce non compilata appare comunque (in daFare), niente corpo vuoto', () => {
    expect(dati.eseguiti.length).toBe(1);
    expect(dati.daFare.length).toBe(1);
    expect(dati.eseguiti.length + dati.nonEseguiti.length + dati.daFare.length).toBe(2);
  });
});
