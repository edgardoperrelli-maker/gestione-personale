import { describe, it, expect } from 'vitest';
import { campiObbligatoriMancantiVoci } from './campiObbligatoriVoci';
import type { TemplateCampo } from './buildVoci';

const campo = (chiave: string, over: Partial<TemplateCampo> = {}): TemplateCampo =>
  ({ chiave, etichetta: chiave.toUpperCase(), tipo: 'testo', ordine: 1, ...over });

describe('campiObbligatoriMancantiVoci', () => {
  it('nessun campo obbligatorio → nessuna voce', () => {
    const campi = [campo('nota')];
    const voci = [{ nominativo: 'Mario', risposte: {} }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('campo obbligatorio vuoto → voce con etichetta mancante', () => {
    const campi = [campo('firma', { obbligatoria: true, etichetta: 'Firma' })];
    const voci = [{ nominativo: 'Mario', risposte: {} }];
    expect(campiObbligatoriMancantiVoci(voci, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Mario', campi: ['Firma'] },
    ]);
  });

  it('campo obbligatorio compilato → nessuna mancanza', () => {
    const campi = [campo('firma', { obbligatoria: true })];
    const voci = [{ nominativo: 'Mario', risposte: { firma: 'ok' } }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('salta le voci manuali (create dal +)', () => {
    const campi = [campo('firma', { obbligatoria: true })];
    const voci = [{ nominativo: 'Mario', risposte: {}, manuale: true }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('ignora i campi foto obbligatori (li gestisce la pipeline foto)', () => {
    const campi = [campo('contatore', { tipo: 'foto', obbligatoria: true })];
    const voci = [{ nominativo: 'Mario', risposte: {} }];
    expect(campiObbligatoriMancantiVoci(voci, campi)).toEqual([]);
  });

  it('esito NEGATIVO → i campi obbligatori (es. sigillo) non bloccano l’invio', () => {
    const campi = [
      campo('esito', { tipo: 'select', etichetta: 'Esito' }),
      campo('sigillo', { obbligatoria: true, etichetta: 'Sigillo' }),
    ];
    // voce negativa (Esito = "No") con sigillo vuoto → NON deve comparire tra le mancanti
    const vociNeg = [{ nominativo: 'Mario', risposte: { esito: 'No' } }];
    expect(campiObbligatoriMancantiVoci(vociNeg, campi)).toEqual([]);
    // controprova: stessa voce POSITIVA (Esito = "Eseguito") col sigillo vuoto → blocca
    const vociPos = [{ nominativo: 'Mario', risposte: { esito: 'Eseguito' } }];
    expect(campiObbligatoriMancantiVoci(vociPos, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Mario', campi: ['Sigillo'] },
    ]);
  });

  it('fotoSoloMassive: sigillo obbligatorio solo sulle voci massive, non sulle sospensioni', () => {
    const campi = [
      campo('eseguito', { tipo: 'select', obbligatoria: true, etichetta: 'ESEGUITO' }),
      campo('sigillo', { obbligatoria: true, etichetta: 'SIGILLO' }),
    ];
    // Voce NON massiva: eseguito compilato, sigillo vuoto → col gate NON blocca.
    const sospensione = [{ nominativo: 'Sosp', risposte: { eseguito: 'SI' }, attivita: 'LIMITAZIONI/SOSPENSIONI' }];
    expect(campiObbligatoriMancantiVoci(sospensione, campi, ['nominativo'], true)).toEqual([]);
    // Voce massiva: sigillo vuoto → blocca ancora.
    const massiva = [{ nominativo: 'Mass', risposte: { eseguito: 'SI' }, attivita: 'LIMITAZIONI MASSIVE' }];
    expect(campiObbligatoriMancantiVoci(massiva, campi, ['nominativo'], true)).toEqual([
      { index: 0, titolo: 'Mass', campi: ['SIGILLO'] },
    ]);
    // Gate spento: sigillo obbligatorio a prescindere dall'attività.
    expect(campiObbligatoriMancantiVoci(sospensione, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Sosp', campi: ['SIGILLO'] },
    ]);
  });

  it('fotoSoloMassive: gli altri obbligatori (ESEGUITO) restano richiesti anche sulle sospensioni', () => {
    const campi = [campo('eseguito', { tipo: 'select', obbligatoria: true, etichetta: 'ESEGUITO' })];
    const sospensione = [{ nominativo: 'Sosp', risposte: {}, attivita: 'LIMITAZIONI/SOSPENSIONI' }];
    expect(campiObbligatoriMancantiVoci(sospensione, campi, ['nominativo'], true)).toEqual([
      { index: 0, titolo: 'Sosp', campi: ['ESEGUITO'] },
    ]);
  });

  it('più campi mancanti nella stessa voce + più voci, con index originale', () => {
    const campi = [
      campo('a', { obbligatoria: true, etichetta: 'A' }),
      campo('b', { obbligatoria: true, etichetta: 'B' }),
    ];
    const voci = [
      { nominativo: 'Uno', risposte: { a: 'x' } }, // manca B
      { nominativo: 'Due', risposte: {} },         // mancano A, B
    ];
    expect(campiObbligatoriMancantiVoci(voci, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Uno', campi: ['B'] },
      { index: 1, titolo: 'Due', campi: ['A', 'B'] },
    ]);
  });
});
