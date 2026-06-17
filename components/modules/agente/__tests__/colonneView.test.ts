import { describe, it, expect } from 'vitest';
import { colonneRilevate, uniscoMappaturaColonna, columnsDaFile } from '@/lib/agente/colonneView';

describe('colonneView', () => {
  it('columnsDaFile: unione ordinata di colonne attuali + sparite (dedup)', () => {
    const out = columnsDaFile({
      file: 'A.xlsx', is_master: true,
      colonne: ['esito', 'sigillo'], colonne_nuove: ['sigillo'], colonne_sparite: ['vecchia'],
      rilevato_il: '2026-06-16T00:00:00Z',
    });
    expect(out).toEqual([
      { nome: 'esito', stato: 'presente' },
      { nome: 'sigillo', stato: 'nuova' },
      { nome: 'vecchia', stato: 'sparita' },
    ]);
  });

  it('colonneRilevate: set globale ordinato e deduplicato dai file', () => {
    const out = colonneRilevate([
      { file: 'A', is_master: true, colonne: ['esito', 'sigillo'], colonne_nuove: [], colonne_sparite: [], rilevato_il: '' },
      { file: 'B', is_master: true, colonne: ['esito', 'comune'], colonne_nuove: [], colonne_sparite: [], rilevato_il: '' },
    ]);
    expect(out).toEqual(['comune', 'esito', 'sigillo']);
  });

  it('uniscoMappaturaColonna: aggiorna la regola del campo dato', () => {
    const reg = [
      { campo: 'esito', colonna: 'esito', abilitato: true },
      { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
    ];
    const out = uniscoMappaturaColonna(reg, 'esito', { colonna: 'ESITO LAVORO' });
    expect(out[0]).toEqual({ campo: 'esito', colonna: 'ESITO LAVORO', abilitato: true });
    expect(out[1]).toBe(reg[1]); // invariato per riferimento
  });

  it('uniscoMappaturaColonna: aggiorna abilitato', () => {
    const reg = [{ campo: 'esito', colonna: 'esito', abilitato: true }];
    const out = uniscoMappaturaColonna(reg, 'esito', { abilitato: false });
    expect(out[0].abilitato).toBe(false);
  });
});
