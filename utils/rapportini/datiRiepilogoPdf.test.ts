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
  // Esito negativo = campo "negativo" (es. crocetta "Cliente assente") + nota obbligatoria. Un select
  // secondario come "Sost. saracinesca" = NO NON è un esito negativo (vedi voceColore.test.ts), quindi
  // le voci non-eseguite qui usano `assente:true` + nota.
  const voci = [
    { nominativo: 'Esposito Anna', odl: 'ODL-100', pdr: '111', via: 'Via Toledo 45', comune: 'Napoli', risposte: { cambio: true, saracinesca: 'SI', foto_contatore: 'https://x/p.jpg' } },
    { nominativo: 'Russo Luigi', odl: 'ODL-200', pdr: '222', via: 'Via Chiaia 12', comune: 'Napoli', risposte: { saracinesca: 'SI' } },
    { nominativo: 'Conte Rosa', odl: 'ODL-300', pdr: '333', via: 'Via Diaz 22', comune: 'Napoli', risposte: { assente: true, note: 'Cliente assente' } },
    { nominativo: 'Gallo Sara', odl: 'ODL-400', pdr: '444', via: 'Via Petrarca 3', comune: 'Napoli', risposte: { assente: true, note: 'Locale chiuso' } },
  ];
  const dati = costruisciDatiPdf({ staffName: 'Mario Rossi', dataLabel: '04/06/2026', voci, campi, infoCampi });

  it('conteggi corretti (lavorazione/SI = eseguito, "Cliente assente" + nota = non eseguito)', () => {
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
    expect(dati.nonEseguiti[1].valori).toEqual(['Gallo Sara', 'ODL-400', 'Via Petrarca 3', 'Napoli', '', '', 'X', 'Locale chiuso']);
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
  // AGGIORNATO 08/08/2026 — l'ESITO non è una lavorazione e non sta più fra le `lavorazioni`.
  // Prima ci finiva, e il blocco produzione mostrava una riga «Eseguito N» sempre identica al
  // riquadro ESEGUITI: informazione duplicata che rubava la riga alle lavorazioni vere.
  // La regressione PLENZICH (45 ≠ 32) resta presidiata dalle altre due asserzioni di questo
  // describe: `stats.eseguiti === 3` qui sopra e la cella "X" della manuale qui sotto.
  it('l\'esito NON è una lavorazione; le lavorazioni vere contano solo dove svolte', () => {
    expect(dati.lavorazioni.find((l) => l.etichetta === 'Eseguito')).toBeUndefined();
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
      { matricola: 'A', via: 'V', manuale: true, approvazione_stato: 'approvato', risposte: { eseguito: 'SI', sostituzione_valvola: 'SI' } },
      { matricola: 'B', via: 'V', manuale: true, approvazione_stato: 'rifiutato', risposte: {} },
      { matricola: 'C', via: 'V', manuale: true, approvazione_stato: 'rifiutato', risposte: { eseguito: 'SI', sostituzione_valvola: 'SI' } },
    ];
    const d = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci: vociR, campi: campiP, infoCampi: null });
    expect(d.stats).toEqual({ totali: 1, eseguiti: 1, nonEseguiti: 0 });
    expect(d.eseguiti.length).toBe(1);
    // La lavorazione della voce rifiutata NON deve entrare nel conteggio (prima si verificava
    // sulla barra "Eseguito", che non esiste più: l'esito non è una lavorazione).
    expect(d.lavorazioni.find((l) => l.etichetta === 'SOSTITUZIONE VALVOLA')?.count).toBe(1);
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

describe('costruisciDatiPdf — task-via (BONIFICHE EXTRA): mostra gli ORDINI, non i contenitori', () => {
  const campiTV: TemplateCampo[] = [
    { chiave: 'minibag', etichetta: 'MINI BAG', tipo: 'crocetta', ordine: 1 },
  ];
  const voci = [
    // contenitori = vie pianificate (manuale=false, vuote)
    { via: 'VIA A', comune: 'X', attivita: 'BONIFICHE EXTRA', risposte: {} },
    { via: 'VIA B', comune: 'X', attivita: 'BONIFICHE EXTRA', risposte: {} },
    // ordini "+" dentro le vie (manuale=true) = il dettaglio del lavoro
    { via: 'VIA A', comune: 'X', manuale: true, risposte: { minibag: true } },
    { via: 'VIA A', comune: 'X', manuale: true, risposte: { minibag: true } },
  ];

  it('con taskVia: esclude i contenitori (manuale=false), mostra solo gli ordini', () => {
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiTV, infoCampi: null, taskVia: true });
    expect(dati.stats.totali).toBe(2);     // solo i 2 ordini
    expect(dati.eseguiti.length).toBe(2);  // ordini (manuale) → eseguiti
    expect(dati.nonEseguiti.length + dati.daFare.length).toBe(0); // nessun contenitore
  });

  it('senza taskVia: i contenitori BONIFICHE EXTRA sono scartati comunque (l\'attività è il segnale), restano gli ordini', () => {
    // Fix definitivo: una voce BONIFICHE EXTRA (manuale=false) è un contenitore in base all'attività,
    // quindi viene scartata dal corpo del PDF anche senza il flag — restano i 2 ordini "+".
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiTV, infoCampi: null });
    expect(dati.stats.totali).toBe(2);     // i 2 ordini; i 2 contenitori BONIFICHE EXTRA spariti
    expect(dati.eseguiti.length).toBe(2);
    expect(dati.daFare.length).toBe(0);
  });

  it('taskVia ma NESSUN ordine (template normale flaggato task-via per errore): NON svuota il PDF', () => {
    const vociNormali = [
      { via: 'VIA 1', comune: 'X', risposte: { minibag: true } }, // manuale=false, interventi normali
      { via: 'VIA 2', comune: 'X', risposte: {} },
    ];
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci: vociNormali, campi: campiTV, infoCampi: null, taskVia: true });
    expect(dati.stats.totali).toBe(2); // guardia: non azzerato
    expect(dati.eseguiti.length + dati.nonEseguiti.length + dati.daFare.length).toBe(2);
  });
});

describe('costruisciDatiPdf — ibrido: classiche + contenitori BONIFICHE EXTRA nello stesso rapportino', () => {
  const campiH: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
    { chiave: 'minibag', etichetta: 'MINI BAG', tipo: 'crocetta', ordine: 2 },
  ];
  const voci = [
    // attività classiche (con esito) — DEVONO restare nel PDF
    { matricola: 'C1', via: 'Via Cl 1', attivita: 'Sostituzione', risposte: { eseguito: 'SI' } },
    { matricola: 'C2', via: 'Via Cl 2', attivita: 'Sostituzione', risposte: { eseguito: 'NO' } },
    // contenitori BONIFICHE EXTRA (manuale=false) — DEVONO sparire dal PDF
    { via: 'Via B 1', attivita: 'BONIFICHE EXTRA', risposte: {} },
    { via: 'Via B 2', attivita: 'BONIFICHE EXTRA', risposte: {} },
    // ordine "+" standalone (FAB, senza parent) — DEVE restare
    { matricola: 'M1', via: 'Via M', manuale: true, risposte: { minibag: true } },
  ];

  it('con taskViaIbrido: tiene le classiche e gli ordini "+", scarta solo i contenitori BONIFICHE EXTRA', () => {
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiH, infoCampi: null, taskViaIbrido: true });
    expect(dati.stats.totali).toBe(3);              // 2 classiche + 1 ordine, i 2 contenitori spariti
    expect(dati.eseguiti.length).toBe(2);           // C1 (SI) + M1 (manuale)
    expect(dati.nonEseguiti.length).toBe(1);        // C2 (NO)
    expect(dati.daFare.length).toBe(0);             // nessun contenitore vuoto residuo
  });

  it('senza flag: i contenitori BONIFICHE EXTRA sono scartati lo stesso (l\'attività è il segnale)', () => {
    // Fix definitivo: lo scarto dei contenitori non dipende più dal flag task_via_ibrido — coerente
    // con il form, dove una voce BONIFICHE EXTRA apre il contenitore anche senza la spunta.
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiH, infoCampi: null });
    expect(dati.stats.totali).toBe(3);              // 2 classiche + 1 ordine; i 2 contenitori spariti
    expect(dati.eseguiti.length).toBe(2);           // C1 (SI) + M1 (manuale)
    expect(dati.nonEseguiti.length).toBe(1);        // C2 (NO)
    expect(dati.daFare.length).toBe(0);
  });
});

describe('costruisciDatiPdf — bonifiche extra: il PDF mostra gli interventi "+", non i contenitori', () => {
  // Regressione reale (PARADISI 26/06): un rapportino di SOLE vie BONIFICHE EXTRA + i loro ordini "+"
  // (voci figlie, manuale=true) deve produrre il PDF con gli interventi creati — non i contenitori
  // vuoti, né un corpo vuoto. Le voci figlie NON vanno filtrate via prima di arrivare qui.
  const campiBE: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  ];
  const voci = [
    { via: 'VIA A', attivita: 'BONIFICHE EXTRA', risposte: {} },                    // contenitore
    { via: 'VIA B', attivita: 'BONIFICHE EXTRA', risposte: {} },                    // contenitore
    { via: 'VIA A', matricola: 'M1', manuale: true, risposte: { eseguito: 'SI' } }, // ordine "+"
    { via: 'VIA A', matricola: 'M2', manuale: true, risposte: { eseguito: 'SI' } }, // ordine "+"
    { via: 'VIA B', matricola: 'M3', manuale: true, risposte: { eseguito: 'SI' } }, // ordine "+"
  ];

  it('tiene i 3 interventi "+" e scarta i 2 contenitori (anche senza flag)', () => {
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiBE, infoCampi: null });
    expect(dati.stats.totali).toBe(3);
    expect(dati.eseguiti.length).toBe(3);
    expect(dati.nonEseguiti.length + dati.daFare.length).toBe(0);
  });

  it('solo contenitori senza ordini → guardia anti-vuoto: NON svuota il PDF', () => {
    const soloVie = [
      { via: 'VIA A', attivita: 'BONIFICHE EXTRA', risposte: {} },
      { via: 'VIA B', attivita: 'BONIFICHE EXTRA', risposte: {} },
    ];
    const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci: soloVie, campi: campiBE, infoCampi: null });
    expect(dati.stats.totali).toBe(2);
  });
});

describe('costruisciDatiPdf — le LAVORAZIONI SVOLTE contano solo sugli interventi eseguiti', () => {
  // Caso DELL'AQUILA 24/06: l'operatore ha marcato mini_bag su interventi NON eseguiti, gonfiando
  // la barra mini_bag SOPRA il numero di eseguiti. Una "lavorazione svolta" su un intervento non
  // eseguito non va conteggiata.
  const campiL: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
    { chiave: 'mini_bag', etichetta: 'MINI BAG', tipo: 'crocetta', ordine: 2 },
    { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 },
  ];
  const voci = [
    { matricola: 'A', via: 'V', risposte: { eseguito: 'SI', mini_bag: true } },           // eseguito + minibag → conta
    { matricola: 'B', via: 'V', risposte: { eseguito: 'SI' } },                            // eseguito, niente minibag
    { matricola: 'C', via: 'V', risposte: { eseguito: 'NO', mini_bag: true, note: 'x' } }, // NON eseguito + minibag → NON conta
  ];
  const dati = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiL, infoCampi: null });

  it('mini_bag su intervento NON eseguito non viene conteggiato (mini_bag ≤ eseguiti)', () => {
    expect(dati.stats.eseguiti).toBe(2);
    expect(dati.lavorazioni.find((l) => l.etichetta === 'MINI BAG')?.count).toBe(1);
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

// Regressione TODINI 04/08/2026: header "16 ESEGUITI" ma sezione "Da eseguire (16)".
// Il rapportino dichiara `matricola_nuova` obbligatoria; il flusso della voce (DIS001,
// disattivazione) no. Valutando l'esito sui campi del rapportino le voci restavano "da fare".
describe('costruisciDatiPdf — esito sui campi DELLA voce (flusso per gruppo attività)', () => {
  const campiRapportino: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true, ordine: 1 },
    { chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', obbligatoria: true, ordine: 2 },
    { chiave: 'note', etichetta: 'NOTE', tipo: 'testo', ordine: 3 },
  ];
  const campiVoce: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true, ordine: 1 },
    { chiave: 'note', etichetta: 'NOTE', tipo: 'testo', ordine: 2 },
  ];
  const voci = [
    { matricola: 'M1', via: 'Via S.Girolamo 72', comune: 'Perugia', campi: campiVoce, risposte: { eseguito: 'SI' } },
    { matricola: 'M2', via: 'Via Salto del 3', comune: 'Perugia', campi: campiVoce, risposte: { eseguito: 'NO', note: 'ASSENTE' } },
  ];
  const dati = costruisciDatiPdf({ staffName: 'Todini Emanuele', dataLabel: '04/08/2026', voci, campi: campiRapportino, infoCampi: null });

  it('la voce SI finisce in "Eseguiti", non in "Da eseguire"', () => {
    expect(dati.eseguiti.length).toBe(1);
    expect(dati.nonEseguiti.length).toBe(1);
    expect(dati.daFare.length).toBe(0);
  });

  it('le sezioni combaciano con i totali dell\'intestazione', () => {
    expect(dati.eseguiti.length).toBe(dati.stats.eseguiti);
    expect(dati.nonEseguiti.length).toBe(dati.stats.nonEseguiti);
  });
});

describe('costruisciDatiPdf — quantità di produzione per ATTIVITÀ', () => {
  // Il caso che ha reso necessario questo blocco: il rapportino GIOSI del 07/08/2026, 24
  // interventi tutti eseguiti su un template AcquaLatina SENZA nessuna crocetta. `lavorazioni`
  // resta vuoto e il rapportino più pieno della giornata mostrava produzione zero.
  const campiSoloEsito: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  ];

  it('conta le attività anche quando il template non ha nessuna crocetta', () => {
    const voci = Array.from({ length: 3 }, (_, i) => ({
      matricola: `M${i}`, via: 'Via 1', attivita: 'SOSTITUZIONE MISURATORE', risposte: { eseguito: 'SI' },
    }));
    const d = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiSoloEsito, infoCampi: null });
    expect(d.lavorazioni).toEqual([]);
    expect(d.attivita).toEqual([{ etichetta: 'SOSTITUZIONE MISURATORE', count: 3 }]);
  });

  it('accorpa le attività che differiscono solo per maiuscole, accenti o spazi', () => {
    const voci = [
      { matricola: 'A', via: 'V', attivita: 'Riattivazione fornitura', risposte: { eseguito: 'SI' } },
      { matricola: 'B', via: 'V', attivita: 'RIATTIVAZIONE  FORNITURA', risposte: { eseguito: 'SI' } },
    ];
    const d = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiSoloEsito, infoCampi: null });
    expect(d.attivita).toHaveLength(1);
    expect(d.attivita?.[0].count).toBe(2);
  });

  it('le voci senza attività finiscono in un bucket esplicito: la somma torna sempre', () => {
    // `rapportino_voci.attivita` è nullable: senza bucket quelle voci sparirebbero dal conteggio
    // e nessuno se ne accorgerebbe, perché il totale non è stampato accanto alle attività.
    const voci = [
      { matricola: 'A', via: 'V', attivita: 'Bonifiche extra', risposte: { eseguito: 'SI' } },
      { matricola: 'B', via: 'V', risposte: { eseguito: 'SI' } },
      { matricola: 'C', via: 'V', attivita: '', risposte: { eseguito: 'NO' } },
    ];
    const d = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiSoloEsito, infoCampi: null });
    expect(d.attivita?.find((a) => a.etichetta === 'SENZA ATTIVITÀ')?.count).toBe(2);
    const somma = (d.attivita ?? []).reduce((s, a) => s + a.count, 0);
    expect(somma).toBe(d.stats.totali);
  });

  it('le voci RIFIUTATE non entrano nel conteggio delle attività', () => {
    const voci = [
      { matricola: 'A', via: 'V', attivita: 'Sonda', approvazione_stato: 'approvato', risposte: { eseguito: 'SI' } },
      { matricola: 'B', via: 'V', attivita: 'Sonda', approvazione_stato: 'rifiutato', risposte: { eseguito: 'SI' } },
    ];
    const d = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiSoloEsito, infoCampi: null });
    expect(d.attivita).toEqual([{ etichetta: 'Sonda', count: 1 }]);
  });
});

describe('costruisciDatiPdf — note, colonne e committenti per il PDF a due livelli', () => {
  const campiNote: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
    { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 2 },
    { chiave: 'codoli', etichetta: 'CODOLI', tipo: 'testo', ordine: 3 },
    { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
  ];
  const voci = [
    { matricola: 'A', via: 'Via 1', risposte: { eseguito: 'SI', cambio: true, note: 'Cane in cortile' } },
    { matricola: 'B', via: 'Via 2', risposte: { eseguito: 'NO', note: 'Assente' } },
  ];
  const d = costruisciDatiPdf({
    staffName: 'X', dataLabel: 'd', voci, campi: campiNote, infoCampi: null, committenti: ['Acea', 'Italgas'],
  });

  it('la nota della voce viaggia su RigaPdf, oltre a restare in colonna per l\'ufficio', () => {
    expect(d.eseguiti[0].nota).toBe('Cane in cortile');
    expect(d.nonEseguiti[0].nota).toBe('Assente');
    // Resta anche come colonna: l'allineamento per indice fra `colonne` e `valori` è il contratto
    // su cui poggia il livello ufficio, e la tabella completa la nota la vuole in tabella.
    const idxNote = d.colonne.findIndex((c) => c.etichetta === 'Note');
    expect(d.eseguiti[0].valori[idxNote]).toBe('Cane in cortile');
  });

  it('una voce senza nota non porta il campo: nessuna riga nota da stampare', () => {
    const senza = costruisciDatiPdf({
      staffName: 'X', dataLabel: 'd', campi: campiNote, infoCampi: null,
      voci: [{ matricola: 'C', via: 'Via 3', risposte: { eseguito: 'SI' } }],
    });
    expect(senza.eseguiti[0].nota).toBeUndefined();
  });

  it('le colonne dichiarano chiave anagrafica, nota ed esito', () => {
    const colNote = d.colonne.find((c) => c.etichetta === 'Note');
    const colEsito = d.colonne.find((c) => c.etichetta === 'ESEGUITO');
    const colVia = d.colonne.find((c) => c.etichetta === 'VIA');
    expect(colNote?.nota).toBe(true);
    expect(colEsito?.esito).toBe(true);
    expect(colVia?.info).toBe('via');
    // `campo` distingue i compilabili dall'anagrafica: il livello campo pesca per nome, non per indice.
    expect(colNote?.campo).toBe('note');
    expect(colVia?.campo).toBeUndefined();
  });

  it('maxLen misura il contenuto reale: 0 sulle colonne vuote ovunque', () => {
    // È la misura con cui il livello ufficio pota. Su GIOSI 07/08 erano 5 colonne su 17.
    const colCodoli = d.colonne.find((c) => c.etichetta === 'CODOLI');
    const colVia = d.colonne.find((c) => c.etichetta === 'VIA');
    expect(colCodoli?.maxLen).toBe(0);
    expect(colVia?.maxLen).toBe('Via 1'.length);
  });

  it('i committenti sono un passacarte, senza euristiche', () => {
    expect(d.committenti).toEqual(['Acea', 'Italgas']);
    const senza = costruisciDatiPdf({ staffName: 'X', dataLabel: 'd', voci, campi: campiNote, infoCampi: null });
    expect(senza.committenti).toEqual([]);
  });

  it('le tre liste coprono ogni voce: i riquadri del PDF tornano sempre', () => {
    // Il renderer conta i riquadri dalle LISTE: questa è l'invariante che glielo consente.
    const totaleRighe = d.eseguiti.length + d.nonEseguiti.length + d.daFare.length;
    expect(totaleRighe).toBe(d.stats.totali);
  });
});
