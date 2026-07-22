import { describe, it, expect } from 'vitest';
import { indiciNegativoSenzaNota } from './vociNegativoSenzaNota';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'] },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('indiciNegativoSenzaNota', () => {
  it('segnala solo il NO senza nota', () => {
    const voci = [
      { risposte: { eseguito: 'SI' } },                       // 0 positivo → ok
      { risposte: { eseguito: 'NO' } },                       // 1 NO senza nota → BLOCCA
      { risposte: { eseguito: 'NO', note: 'ASSENTE' } },      // 2 NO con nota → ok
      { risposte: { eseguito: 'NESSUN PASSAGGIO' } },         // 3 nessun passaggio → ok (no nota)
      { risposte: {} },                                       // 4 senza esito → NON è "nota mancante"
    ];
    expect(indiciNegativoSenzaNota(voci, campi)).toEqual([1]);
  });

  it('esclude le voci manuali (+)', () => {
    const voci = [{ risposte: { eseguito: 'NO' }, manuale: true }];
    expect(indiciNegativoSenzaNota(voci, campi)).toEqual([]);
  });

  it('esclude i contenitori task-via (BONIFICHE EXTRA, manuale=false)', () => {
    const voci = [{ risposte: { eseguito: 'NO' }, attivita: 'BONIFICHE EXTRA', manuale: false }];
    expect(indiciNegativoSenzaNota(voci, campi)).toEqual([]);
  });

  it('usa i campi per-voce (campi_snapshot) quando presenti', () => {
    const voci = [{ risposte: { eseguito: 'NO' }, campi_snapshot: campi }];
    expect(indiciNegativoSenzaNota(voci, [])).toEqual([0]);
  });
});
