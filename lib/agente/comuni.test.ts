import { describe, it, expect } from 'vitest';
import {
  comuneDaFile,
  comuniMaster,
  etichettaComune,
  normalizzaComune,
  opzioniAceaTarget,
  opzioniComuneGiro,
  TARGET_DUNNING,
  TARGET_TUTTI,
} from './comuni';
import type { AgenteFileColonneRow } from './uiTypes';

/** Riga minima: le API leggono solo file + is_master. */
function riga(file: string, is_master: boolean): Pick<AgenteFileColonneRow, 'file' | 'is_master'> {
  return { file, is_master };
}

describe('comuneDaFile', () => {
  it('toglie .xlsx e normalizza a maiuscolo', () => {
    expect(comuneDaFile('LABICO.xlsx')).toBe('LABICO');
    expect(comuneDaFile('Zagarolo.xlsx')).toBe('ZAGAROLO');
  });
  it('estensione maiuscola/mista', () => {
    expect(comuneDaFile('LABICO.XLSX')).toBe('LABICO');
    expect(comuneDaFile('Labico.XlsX')).toBe('LABICO');
  });
  it('spazi attorno al nome e prima dell’estensione', () => {
    expect(comuneDaFile('  LABICO.xlsx  ')).toBe('LABICO');
    expect(comuneDaFile('ZAGAROLO .xlsx')).toBe('ZAGAROLO');
  });
  it('comune composto: gli spazi interni restano', () => {
    expect(comuneDaFile('san cesareo.xlsx')).toBe('SAN CESAREO');
  });
  it('toglie solo l’estensione finale, non i punti interni', () => {
    expect(comuneDaFile('S.CESAREO.xlsx')).toBe('S.CESAREO');
  });
  it('senza estensione: il nome è già il comune', () => {
    expect(comuneDaFile('LABICO')).toBe('LABICO');
  });
  it('nome vuoto o solo estensione → stringa vuota', () => {
    expect(comuneDaFile('')).toBe('');
    expect(comuneDaFile('.xlsx')).toBe('');
    expect(comuneDaFile('   ')).toBe('');
  });
});

describe('comuniMaster', () => {
  it('solo i master, ordinati alfabeticamente', () => {
    const rows = [riga('ZAGAROLO.xlsx', true), riga('LABICO.xlsx', true), riga('INTERVENTI.xlsx', false)];
    expect(comuniMaster(rows)).toEqual(['LABICO', 'ZAGAROLO']);
  });
  it('esclude i non-master anche se sarebbero comuni validi', () => {
    expect(comuniMaster([riga('LABICO.xlsx', false)])).toEqual([]);
  });
  it('dedup: stesso comune da nomi file equivalenti', () => {
    const rows = [riga('LABICO.xlsx', true), riga('labico.XLSX', true), riga(' Labico.xlsx ', true)];
    expect(comuniMaster(rows)).toEqual(['LABICO']);
  });
  it('scarta i nomi che non producono un comune', () => {
    expect(comuniMaster([riga('.xlsx', true), riga('LABICO.xlsx', true)])).toEqual(['LABICO']);
  });
  it('elenco vuoto → []', () => {
    expect(comuniMaster([])).toEqual([]);
  });
});

describe('etichettaComune', () => {
  it('maiuscola iniziale per parola', () => {
    expect(etichettaComune('LABICO')).toBe('Labico');
    expect(etichettaComune('SAN CESAREO')).toBe('San Cesareo');
  });
});

describe('opzioniAceaTarget', () => {
  it('DUNNING, poi Tutti, poi un comune per master', () => {
    const rows = [riga('ZAGAROLO.xlsx', true), riga('LABICO.xlsx', true), riga('X.xlsx', false)];
    expect(opzioniAceaTarget(rows)).toEqual([
      { value: TARGET_DUNNING, label: 'DUNNING — Limitazioni con ordine' },
      { value: TARGET_TUTTI, label: 'Tutti i comuni — Limitazioni massive' },
      { value: 'LABICO', label: 'Labico — Limitazioni massive' },
      { value: 'ZAGAROLO', label: 'Zagarolo — Limitazioni massive' },
    ]);
  });
  it('nessun master → resta comunque DUNNING (mai select vuota)', () => {
    expect(opzioniAceaTarget([])).toEqual([
      { value: TARGET_DUNNING, label: 'DUNNING — Limitazioni con ordine' },
    ]);
  });
});

describe('opzioniComuneGiro', () => {
  it('Tutti in testa, poi i comuni master', () => {
    const rows = [riga('ZAGAROLO.xlsx', true), riga('LABICO.xlsx', true)];
    expect(opzioniComuneGiro(rows)).toEqual([
      { value: TARGET_TUTTI, label: 'Tutti i comuni' },
      { value: 'LABICO', label: 'Labico' },
      { value: 'ZAGAROLO', label: 'Zagarolo' },
    ]);
  });
  it('nessun master → solo Tutti i comuni', () => {
    expect(opzioniComuneGiro([])).toEqual([{ value: TARGET_TUTTI, label: 'Tutti i comuni' }]);
  });
});

describe('normalizzaComune', () => {
  const rows = [riga('ZAGAROLO.xlsx', true), riga('LABICO.xlsx', true), riga('ALTRO.xlsx', false)];

  it('comune noto → normalizzato a maiuscolo', () => {
    expect(normalizzaComune(' labico ', rows)).toEqual({ ok: true, comune: 'LABICO' });
  });
  it('TUTTI / vuoto / assente → null (nessun filtro)', () => {
    expect(normalizzaComune('TUTTI', rows)).toEqual({ ok: true, comune: null });
    expect(normalizzaComune('  ', rows)).toEqual({ ok: true, comune: null });
    expect(normalizzaComune(undefined, rows)).toEqual({ ok: true, comune: null });
  });
  it('comune sconosciuto → errore, niente degrado silenzioso', () => {
    const r = normalizzaComune('ROMA', rows);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain('ROMA');
  });
  it('file non-master non abilita il comune', () => {
    expect(normalizzaComune('ALTRO', rows).ok).toBe(false);
  });
});
