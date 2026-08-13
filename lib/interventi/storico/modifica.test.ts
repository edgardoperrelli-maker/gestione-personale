// lib/interventi/storico/modifica.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildCampiEditor, estraiFotoPaths, anagraficaPatchValida, anagraficaPatchIntervento,
  anagraficaPatchRegistro, campiPerChiusuraStorico, tabellaMisuratori,
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

describe('tabellaMisuratori', () => {
  it('acqualatina → il SUO registro, non quello ACEA', () => {
    expect(tabellaMisuratori('acqualatina')).toBe('acqualatina_misuratori_rimossi');
  });
  it('acea, altri committenti o assente → registro ACEA (default storico)', () => {
    expect(tabellaMisuratori('acea')).toBe('misuratori_rimossi');
    expect(tabellaMisuratori('italgas')).toBe('misuratori_rimossi');
    expect(tabellaMisuratori(null)).toBe('misuratori_rimossi');
    expect(tabellaMisuratori(undefined)).toBe('misuratori_rimossi');
  });
});

describe('anagraficaPatchRegistro', () => {
  it('pdr → impianto, nominativo/comune/cap invariati', () => {
    expect(anagraficaPatchRegistro({ pdr: 'P1', nominativo: 'ROSSI', comune: 'TERRACINA', cap: '04019' }))
      .toEqual({ impianto: 'P1', nominativo: 'ROSSI', comune: 'TERRACINA', cap: '04019' });
  });

  it("via spezza l'indirizzo in via + civico, come il registro lo tiene", () => {
    expect(anagraficaPatchRegistro({ via: 'VIA ROMA 10' })).toEqual({ via: 'VIA ROMA', civico: '10' });
  });

  it('un indirizzo senza numero finale: tutto in via, civico null', () => {
    expect(anagraficaPatchRegistro({ via: 'VIA ROMA' })).toEqual({ via: 'VIA ROMA', civico: null });
  });

  it('via CANCELLATA (null): non propaga niente, nemmeno il civico', () => {
    expect(anagraficaPatchRegistro({ via: null })).toEqual({});
  });

  it("odl e matricola NON entrano: sono la chiave e l'identità della riga di registro, non anagrafica", () => {
    expect(anagraficaPatchRegistro({ odl: '100001', matricola: 'M1', pdr: 'P1' })).toEqual({ impianto: 'P1' });
  });

  it('attivita e fascia_oraria NON entrano: classificazione dell\'intervento, non anagrafica del punto', () => {
    expect(anagraficaPatchRegistro({ attivita: 'BONIFICHE', fascia_oraria: '8-12' })).toEqual({});
  });

  /*
    Un campo vuoto NON cancella (13/08/2026). La regola precedente diceva l'opposto — «la
    cancellazione è una correzione» — e in produzione si è vista per quello che era: un
    intervento senza PDR (legittimo: è la fotografia di un'uscita, non l'anagrafica del punto)
    svuotava cod. fornitura e nome utente sull'ordine a registro a ogni chiusura. Sedici righe
    di `acqualatina_ordini` erano già così, cinque svuotate in venti minuti la mattina stessa.
    Stessa regola del verso opposto (`patchAnagrafica` in `lib/acqualatina/ordiniDaMaster.ts`).
  */
  it('un campo cancellato (null) NON si propaga: il vuoto non è una correzione', () => {
    expect(anagraficaPatchRegistro({ nominativo: null })).toEqual({});
    expect(anagraficaPatchRegistro({ pdr: null })).toEqual({});
  });

  it('nemmeno la stringa vuota o i soli spazi cancellano', () => {
    expect(anagraficaPatchRegistro({ pdr: '', nominativo: '   ' })).toEqual({});
  });

  it('il campo pieno passa: si CORREGGE da qui, non si azzera', () => {
    expect(anagraficaPatchRegistro({ pdr: '', nominativo: 'ROSSI' })).toEqual({ nominativo: 'ROSSI' });
  });

  it('vuoto → vuoto', () => {
    expect(anagraficaPatchRegistro({})).toEqual({});
  });
});
