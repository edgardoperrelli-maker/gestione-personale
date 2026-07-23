// lib/interventi/storico/modifica.test.ts
import { describe, it, expect } from 'vitest';
import { buildCampiEditor, estraiFotoPaths, anagraficaPatchValida, anagraficaPatchIntervento } from './modifica';
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

  it('esito select con sole opzioni positive → aggiunge "NO"', () => {
    const campi = buildCampiEditor([c({ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI'], ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'eseguito')?.opzioni).toEqual(['SI', 'NO']);
  });
  it('esito select senza opzioni → SI + NO', () => {
    const campi = buildCampiEditor([c({ chiave: 'esito', etichetta: 'Esito', tipo: 'select', ordine: 1 })]);
    expect(campi.find((x) => x.chiave === 'esito')?.opzioni).toEqual(['SI', 'NO']);
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
