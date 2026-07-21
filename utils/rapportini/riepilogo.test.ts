import { describe, it, expect } from 'vitest';
import { statoVoce, riepilogoRapportino } from './riepilogo';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  { chiave: 'cambio', etichetta: 'CAMBIO', tipo: 'crocetta', ordine: 2 },
  { chiave: 'mini_bag', etichetta: 'MINI BAG', tipo: 'crocetta', ordine: 3 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 4 },
];

describe('statoVoce', () => {
  it('select SI → eseguito', () => expect(statoVoce({ eseguito: 'SI' }, campi)).toBe('eseguito'));
  // Esito negativo: la nota è obbligatoria → con nota è "non_eseguito", senza nota resta "da_fare".
  it('select NO + nota → non_eseguito', () => expect(statoVoce({ eseguito: 'NO', note: 'Motivo' }, campi)).toBe('non_eseguito'));
  it('select NO senza nota → da_fare (nota obbligatoria con esito negativo)', () => expect(statoVoce({ eseguito: 'NO' }, campi)).toBe('da_fare'));
  it('crocetta positiva → eseguito', () => expect(statoVoce({ cambio: true }, campi)).toBe('eseguito'));
  it('vuoto → da_fare', () => expect(statoVoce({}, campi)).toBe('da_fare'));
  it('solo note → da_fare', () => expect(statoVoce({ note: 'x' }, campi)).toBe('da_fare'));
});

describe('riepilogoRapportino', () => {
  it('conta esiti e da fare', () => {
    // L'esito negativo richiede la nota per essere "non eseguito" (altrimenti resta "da fare").
    const voci = [{ risposte: { eseguito: 'SI' } }, { risposte: { eseguito: 'NO', note: 'Motivo' } }, { risposte: {} }];
    expect(riepilogoRapportino(voci, campi)).toMatchObject({ eseguiti: 1, nonEseguiti: 1, daFare: 1, totali: 3 });
  });
  it('conta le lavorazioni (solo crocette con count>0, in ordine di template)', () => {
    const voci = [
      { risposte: { eseguito: 'SI', cambio: true, mini_bag: true } },
      { risposte: { eseguito: 'SI', cambio: true } },
      { risposte: {} },
    ];
    expect(riepilogoRapportino(voci, campi).lavorazioni).toEqual([
      { chiave: 'cambio', etichetta: 'CAMBIO', count: 2 },
      { chiave: 'mini_bag', etichetta: 'MINI BAG', count: 1 },
    ]);
  });
  it('nessuna crocetta spuntata → lavorazioni vuote', () => {
    expect(riepilogoRapportino([{ risposte: {} }], campi).lavorazioni).toEqual([]);
  });
  it('gate invio: daFare 0 sse tutte con esito', () => {
    expect(riepilogoRapportino([{ risposte: { eseguito: 'SI' } }], campi).daFare).toBe(0);
    expect(riepilogoRapportino([{ risposte: {} }], campi).daFare).toBe(1);
    expect(riepilogoRapportino([], campi).daFare).toBe(0);
  });
  it('conta le saracinesche sostituite (SI, tollerante a booleano/stringa/chiave)', () => {
    const voci = [
      { risposte: { eseguito: 'SI', sostituzione_valvola: 'SI' } },   // stringa "SI"
      { risposte: { eseguito: 'SI', sostituzione_valvola: true } },   // booleano true → SI
      { risposte: { eseguito: 'SI', sost_valvola: 'SI' } },           // chiave alternativa
      { risposte: { eseguito: 'SI', sostituzione_valvola: 'NO' } },   // NO → non conta
      { risposte: { eseguito: 'SI' } },                                // assente → non conta
    ];
    expect(riepilogoRapportino(voci, campi).saracinesche).toBe(3);
  });
  it('saracinesca: scarta i path-foto e le voci annullate, include le manuali', () => {
    const voci = [
      { risposte: { sost_valvola: 'rapportini/abc/x.jpg' } },         // path-foto → scartato
      { risposte: { sostituzione_valvola: 'SI' }, annullato: true },  // annullata → non conta
      { risposte: { sostituzione_valvola: true }, manuale: true },    // manuale → conta
    ];
    expect(riepilogoRapportino(voci, campi).saracinesche).toBe(1);
  });
  it('voce manuale (creata dal +) → eseguito, mai daFare', () => {
    const r = riepilogoRapportino([{ risposte: {}, manuale: true }, { risposte: {} }], campi);
    expect(r.eseguiti).toBe(1);
    expect(r.daFare).toBe(1);
  });
  it('le voci annullate non contano in daFare (invio possibile)', () => {
    const campi = [{ chiave: 'esito', etichetta: 'Esito', tipo: 'crocetta' as const, ordine: 0 }];
    const r = riepilogoRapportino(
      [{ risposte: {}, annullato: true }, { risposte: { esito: true }, annullato: false }],
      campi,
    );
    expect(r.daFare).toBe(0);
    expect(r.annullati).toBe(1);
  });
  it('le voci RIFIUTATE sono scartate: fuori da eseguiti E dai totali', () => {
    const r = riepilogoRapportino([
      { risposte: { eseguito: 'SI' }, manuale: true, approvazione_stato: 'approvato' },
      { risposte: {}, manuale: true, approvazione_stato: 'rifiutato' },
      { risposte: {}, manuale: true, approvazione_stato: 'rifiutato' },
    ], campi);
    expect(r.eseguiti).toBe(1);
    expect(r.totali).toBe(1);
  });
});
