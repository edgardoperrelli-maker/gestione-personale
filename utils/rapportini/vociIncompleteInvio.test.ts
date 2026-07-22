import { describe, it, expect } from 'vitest';
import { indiciVociIncomplete } from './vociIncompleteInvio';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'] },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('indiciVociIncomplete', () => {
  it('blocca senza esito e NO-senza-nota; lascia passare SI / NO+nota / NESSUN PASSAGGIO', () => {
    const voci = [
      { risposte: { eseguito: 'SI' } },                  // 0 ok
      { risposte: {} },                                  // 1 senza_esito → blocca
      { risposte: { eseguito: 'NO' } },                  // 2 nota_mancante → blocca
      { risposte: { eseguito: 'NO', note: 'ASSENTE' } }, // 3 ok
      { risposte: { eseguito: 'NESSUN PASSAGGIO' } },    // 4 ok
    ];
    expect(indiciVociIncomplete(voci, campi)).toEqual([
      { index: 1, motivo: 'senza_esito' },
      { index: 2, motivo: 'nota_mancante' },
    ]);
  });

  it('esclude le voci manuali (+)', () => {
    expect(indiciVociIncomplete([{ risposte: {}, manuale: true }], campi)).toEqual([]);
  });

  it('esclude i contenitori task-via BONIFICHE EXTRA (manuale=false)', () => {
    expect(indiciVociIncomplete([{ risposte: {}, attivita: 'BONIFICHE EXTRA', manuale: false }], campi)).toEqual([]);
  });

  it('modalità task-via PURO (tutto): ogni voce è contenitore → nessun blocco', () => {
    const voci = [{ risposte: {}, attivita: 'QUALSIASI', manuale: false }];
    expect(indiciVociIncomplete(voci, campi, { tutto: true })).toEqual([]);
  });

  it('usa i campi per-voce (campi_snapshot) quando presenti', () => {
    expect(indiciVociIncomplete([{ risposte: {}, campi_snapshot: campi }], [])).toEqual([{ index: 0, motivo: 'senza_esito' }]);
  });
});
