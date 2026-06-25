// lib/interventi/storico/modifica.test.ts
import { describe, it, expect } from 'vitest';
import { buildCampiEditor, unisciCampiTemplateLive, estraiFotoPaths, anagraficaPatchValida, anagraficaPatchIntervento } from './modifica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const c = (p: Partial<TemplateCampo> & { chiave: string; tipo: TemplateCampo['tipo'] }): TemplateCampo => ({
  etichetta: p.chiave, ordine: 0, ...p,
});

describe('buildCampiEditor', () => {
  it('esclude i campi foto e aggiunge Note se mancante', () => {
    const campi = buildCampiEditor([c({ chiave: 'eseguito', tipo: 'select', ordine: 1 }), c({ chiave: 'f', tipo: 'foto', ordine: 2 })]);
    expect(campi.map((x) => x.chiave)).toEqual(['eseguito', 'note']);
    expect(campi.find((x) => x.chiave === 'note')?.tipo).toBe('testo');
  });
  it('non duplica Note se già presente', () => {
    const campi = buildCampiEditor([c({ chiave: 'note', tipo: 'testo', ordine: 1 })]);
    expect(campi.filter((x) => x.chiave === 'note').length).toBe(1);
  });
  it('ordina per ordine', () => {
    const campi = buildCampiEditor([c({ chiave: 'b', tipo: 'testo', ordine: 2 }), c({ chiave: 'a', tipo: 'testo', ordine: 1 })]);
    expect(campi.map((x) => x.chiave).slice(0, 2)).toEqual(['a', 'b']);
  });
  it('snapshot vuoto/null → solo note', () => {
    expect(buildCampiEditor(null).map((x) => x.chiave)).toEqual(['note']);
  });
});

describe('unisciCampiTemplateLive', () => {
  it('accoda i campi nuovi del template live mancanti nello snapshot (es. sigillo)', () => {
    const snapshot = [c({ chiave: 'eseguito', tipo: 'select', ordine: 1 }), c({ chiave: 'note', tipo: 'testo', ordine: 2 })];
    const live = [
      c({ chiave: 'eseguito', tipo: 'select', ordine: 1 }),
      c({ chiave: 'note', tipo: 'testo', ordine: 2 }),
      c({ chiave: 'sigillo', tipo: 'testo', etichetta: 'SIGILLO', ordine: 5 }),
    ];
    expect(unisciCampiTemplateLive(snapshot, live).map((x) => x.chiave)).toEqual(['eseguito', 'note', 'sigillo']);
  });
  it('lo snapshot vince sulle chiavi già presenti (non sostituisce la config vista dall’operatore)', () => {
    const snapshot = [c({ chiave: 'eseguito', tipo: 'select', etichetta: 'ESEGUITO', ordine: 1 })];
    const live = [c({ chiave: 'eseguito', tipo: 'select', etichetta: 'CAMBIATO', ordine: 9 })];
    const out = unisciCampiTemplateLive(snapshot, live);
    expect(out).toHaveLength(1);
    expect(out[0].etichetta).toBe('ESEGUITO');
  });
  it('non rimuove mai un campo dello snapshot assente nel template live', () => {
    const snapshot = [c({ chiave: 'vecchio', tipo: 'testo', ordine: 1 })];
    expect(unisciCampiTemplateLive(snapshot, []).map((x) => x.chiave)).toEqual(['vecchio']);
  });
  it('snapshot/live null → array vuoto', () => {
    expect(unisciCampiTemplateLive(null, null)).toEqual([]);
  });
  it('integrazione con buildCampiEditor: il sigillo aggiunto al template è editabile (ordinato)', () => {
    const snapshot = [c({ chiave: 'eseguito', tipo: 'select', ordine: 1 }), c({ chiave: 'note', tipo: 'testo', ordine: 2 })];
    const live = [c({ chiave: 'sigillo', tipo: 'testo', etichetta: 'SIGILLO', ordine: 5 })];
    const campi = buildCampiEditor(unisciCampiTemplateLive(snapshot, live));
    expect(campi.map((x) => x.chiave)).toEqual(['eseguito', 'note', 'sigillo']);
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
