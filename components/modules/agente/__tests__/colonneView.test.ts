import { describe, it, expect } from 'vitest';
import { colonneRilevate, uniscoMappaturaColonna, columnsDaFile, mappaturaCompleta, colonneDuplicate } from '@/lib/agente/colonneView';
import { CAMPI_MAPPABILI } from '@/lib/agente/decisione';
import type { RegolaMappa } from '@/lib/agente/decisione';

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

  it('colonneRilevate: dedup case-insensitive — "Esito"/"esito" cross-file produce un solo elemento', () => {
    const out = colonneRilevate([
      { file: 'A', is_master: true, colonne: ['Esito', 'sigillo'], colonne_nuove: [], colonne_sparite: [], rilevato_il: '' },
      { file: 'B', is_master: false, colonne: ['esito', 'comune'], colonne_nuove: [], colonne_sparite: [], rilevato_il: '' },
    ]);
    // 'Esito' è visto per primo, quindi è il nome conservato; 'esito' viene scartato
    const esitoEntries = out.filter((c) => c.toLowerCase() === 'esito');
    expect(esitoEntries).toHaveLength(1);
    expect(esitoEntries[0]).toBe('Esito');
    // l'array complessivo deve restare ordinato e deduplicato
    // localeCompare pone le maiuscole dopo le minuscole, quindi 'Esito' > 'comune'
    expect(out).toEqual(['comune', 'Esito', 'sigillo']);
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

  it('uniscoMappaturaColonna: upsert — aggiunge il campo se non presente', () => {
    const reg: RegolaMappa[] = [{ campo: 'esito', colonna: 'ESITO', abilitato: true }];
    const out = uniscoMappaturaColonna(reg, 'matricola', { colonna: 'MATRICOLA', abilitato: true });
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ campo: 'matricola', colonna: 'MATRICOLA', abilitato: true });
  });

  it('uniscoMappaturaColonna: upsert marcatore — usa default auto:true', () => {
    const reg: RegolaMappa[] = [];
    const out = uniscoMappaturaColonna(reg, 'marcatore', { abilitato: true });
    expect(out[0]).toEqual({ campo: 'marcatore', colonna: '', auto: true, abilitato: true });
  });
});

describe('mappaturaCompleta', () => {
  it('restituisce una riga per ogni campo in CAMPI_MAPPABILI nell\'ordine canonico', () => {
    const out = mappaturaCompleta([]);
    expect(out.map((r) => r.campo)).toEqual([...CAMPI_MAPPABILI]);
  });

  it('usa la regola esistente se presente', () => {
    const existing: RegolaMappa[] = [
      { campo: 'esito', colonna: 'ESITO LAVORO', abilitato: true },
    ];
    const out = mappaturaCompleta(existing);
    const esitoRow = out.find((r) => r.campo === 'esito')!;
    expect(esitoRow.colonna).toBe('ESITO LAVORO');
    expect(esitoRow.abilitato).toBe(true);
  });

  it('usa default disabilitato per campi non in mappatura', () => {
    const out = mappaturaCompleta([]);
    const viaRow = out.find((r) => r.campo === 'via')!;
    expect(viaRow).toEqual({ campo: 'via', colonna: '', abilitato: false });
  });

  it('usa default auto:true per marcatore non in mappatura', () => {
    const out = mappaturaCompleta([]);
    const marcatoreRow = out.find((r) => r.campo === 'marcatore')!;
    expect(marcatoreRow).toEqual({ campo: 'marcatore', colonna: '', auto: true, abilitato: false });
  });

  it('preserva la regola marcatore esistente se presente', () => {
    const existing: RegolaMappa[] = [
      { campo: 'marcatore', colonna: 'COLONNA_EXTRA', auto: false, abilitato: true },
    ];
    const out = mappaturaCompleta(existing);
    const marcatoreRow = out.find((r) => r.campo === 'marcatore')!;
    expect(marcatoreRow).toEqual({ campo: 'marcatore', colonna: 'COLONNA_EXTRA', auto: false, abilitato: true });
  });

  it('ha esattamente tanti elementi quanti i CAMPI_MAPPABILI', () => {
    const partial: RegolaMappa[] = [
      { campo: 'esecutore', colonna: 'ESEC', abilitato: true },
      { campo: 'sigillo', colonna: 'SIG', abilitato: false },
    ];
    const out = mappaturaCompleta(partial);
    expect(out).toHaveLength(CAMPI_MAPPABILI.length);
  });
});

describe('colonneDuplicate', () => {
  it('restituisce vuoto se non ci sono duplicati', () => {
    expect(colonneDuplicate(['A', 'B', 'C'])).toEqual([]);
  });

  it('restituisce i nomi che compaiono più di una volta', () => {
    const result = colonneDuplicate(['A', 'B', 'A', 'C']);
    expect(result).toContain('A');
    expect(result).not.toContain('B');
    expect(result).not.toContain('C');
  });

  it('confronto case-insensitive: "esito" e "ESITO" contano come duplicato', () => {
    const result = colonneDuplicate(['esito', 'ESITO', 'sigillo']);
    expect(result.length).toBe(2); // entrambe le occorrenze tornano
    expect(result.map((c) => c.toLowerCase())).toEqual(['esito', 'esito']);
  });

  it('array vuoto → array vuoto', () => {
    expect(colonneDuplicate([])).toEqual([]);
  });

  it('elemento singolo → nessun duplicato', () => {
    expect(colonneDuplicate(['sola'])).toEqual([]);
  });
});
