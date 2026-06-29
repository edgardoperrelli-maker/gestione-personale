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
