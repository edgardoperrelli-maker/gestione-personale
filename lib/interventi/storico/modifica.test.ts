// lib/interventi/storico/modifica.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildCampiEditor, estraiFotoPaths, anagraficaPatchValida, anagraficaPatchIntervento, campiPerChiusuraStorico,
} from './modifica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const c = (p: Partial<TemplateCampo> & { chiave: string; tipo: TemplateCampo['tipo'] }): TemplateCampo => ({
  etichetta: p.chiave, ordine: 0, ...p,
});

describe('buildCampiEditor', () => {
  it('esclude i campi foto e aggiunge Sigillo + Note se mancanti', () => {
    const campi = buildCampiEditor([c({ chiave: 'eseguito', tipo: 'select', ordine: 1 }), c({ chiave: 'f', tipo: 'foto', ordine: 2 })]);
    expect(campi.map((x) => x.chiave)).toEqual(['eseguito', 'sigillo', 'note']);
    expect(campi.find((x) => x.chiave === 'note')?.tipo).toBe('testo');
    expect(campi.find((x) => x.chiave === 'sigillo')?.tipo).toBe('testo');
  });
  it('non duplica Sigillo se già presente nel template', () => {
    const campi = buildCampiEditor([c({ chiave: 'sigillo', tipo: 'testo', ordine: 1 })]);
    expect(campi.filter((x) => x.chiave === 'sigillo').length).toBe(1);
  });
  it('non duplica Note se già presente', () => {
    const campi = buildCampiEditor([c({ chiave: 'note', tipo: 'testo', ordine: 1 })]);
    expect(campi.filter((x) => x.chiave === 'note').length).toBe(1);
  });
  it('ordina per ordine', () => {
    const campi = buildCampiEditor([c({ chiave: 'b', tipo: 'testo', ordine: 2 }), c({ chiave: 'a', tipo: 'testo', ordine: 1 })]);
    expect(campi.map((x) => x.chiave).slice(0, 2)).toEqual(['a', 'b']);
  });
  it('snapshot vuoto/null → sigillo + note', () => {
    expect(buildCampiEditor(null).map((x) => x.chiave)).toEqual(['sigillo', 'note']);
  });

  it('esito select con sole opzioni positive → aggiunge "NO" e "NESSUN PASSAGGIO"', () => {
    const campi = buildCampiEditor([c({ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI'], ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'eseguito')?.opzioni).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
  });
  it('esito select senza opzioni → i tre canonici', () => {
    const campi = buildCampiEditor([c({ chiave: 'esito', etichetta: 'Esito', tipo: 'select', ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'esito')?.opzioni).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
  });
  it('snapshot pre-«NESSUN PASSAGGIO» (SI/NO) → correggibile anche in «nessun passaggio»', () => {
    const campi = buildCampiEditor([c({ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'eseguito')?.opzioni).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
  });
  it('esito select ACEA → preserva le opzioni esistenti (SI + NO già presenti)', () => {
    const campi = buildCampiEditor([c({ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'], ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'eseguito')?.opzioni).toEqual(['SI', 'NESSUN PASSAGGIO', 'NO']);
  });
  it('select secondario (non esito) → opzioni intatte', () => {
    const campi = buildCampiEditor([c({ chiave: 'sostituzione_valvola', etichetta: 'Sostituzione valvola', tipo: 'select', opzioni: ['SI'], ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'sostituzione_valvola')?.opzioni).toEqual(['SI']);
  });
});

describe('campiPerChiusuraStorico', () => {
  const matr = c({ chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', obbligatoria: true, ordine: 2 });

  it('rapportino prima del gate (03/08) → matricola obbligatoria spenta', () => {
    const campi = campiPerChiusuraStorico([matr], '2026-08-03');
    expect(campi[0].obbligatoria).toBe(false);
  });
  it('rapportino dal gate in poi (04/08) → resta obbligatoria', () => {
    const campi = campiPerChiusuraStorico([matr], '2026-08-04');
    expect(campi[0].obbligatoria).toBe(true);
  });
  it('rapportino successivo → resta obbligatoria', () => {
    const campi = campiPerChiusuraStorico([matr], '2026-09-01');
    expect(campi[0].obbligatoria).toBe(true);
  });
  it('data ignota (null) → spenta, prudente come "prima del gate"', () => {
    const campi = campiPerChiusuraStorico([matr], null);
    expect(campi[0].obbligatoria).toBe(false);
  });
  it('non tocca le matricole già facoltative, né i campi non-matricola', () => {
    const facoltativa = c({ chiave: 'm2', tipo: 'matricola', obbligatoria: false, ordine: 1 });
    const testo = c({ chiave: 'sigillo', tipo: 'testo', obbligatoria: true, ordine: 3 });
    const campi = campiPerChiusuraStorico([facoltativa, testo], '2026-08-03');
    expect(campi).toEqual([facoltativa, testo]);
  });
});

describe('estraiFotoPaths', () => {
  it('estrae solo path rapportini/ dai campi foto', () => {
    const campi = [c({ chiave: 'foto1', tipo: 'foto', etichetta: 'Foto 1', ordine: 1 }), c({ chiave: 'eseguito', tipo: 'select', ordine: 2 })];
    const r = { foto1: ['rapportini/a.jpg', 'blob-locale:x'], eseguito: 'SI' };
    expect(estraiFotoPaths(r, campi)).toEqual([{ etichetta: 'Foto 1', path: 'rapportini/a.jpg' }]);
  });
  it('risposte null → vuoto', () => {
    expect(estraiFotoPaths(null, [])).toEqual([]);
  });
});

describe('anagraficaPatchValida', () => {
  it('whitelist + trim + vuoto→null + scarta chiavi ignote', () => {
    expect(anagraficaPatchValida({ odl: ' 123 ', via: '', pippo: 'x', comune: 'Roma' }))
      .toEqual({ odl: '123', via: null, comune: 'Roma' });
  });
  it('non oggetto → vuoto', () => {
    expect(anagraficaPatchValida(null)).toEqual({});
  });
});

describe('anagraficaPatchIntervento', () => {
  it('mappa le colonne voce → intervento (solo presenti)', () => {
    expect(anagraficaPatchIntervento({ via: 'Via X', attivita: 'BONIFICHE', matricola: 'M1', odl: null }))
      .toEqual({ indirizzo: 'Via X', intervento_tipo: 'BONIFICHE', matricola_contatore: 'M1', odl: null });
  });
  it('vuoto → vuoto', () => {
    expect(anagraficaPatchIntervento({})).toEqual({});
  });
});
