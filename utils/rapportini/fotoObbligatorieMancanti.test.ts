import { describe, it, expect } from 'vitest';
import { contaFotoObbligatorieMancanti, fotoObbligatorieMancantiDettaglio } from './fotoObbligatorieMancanti';

const campi = [
  { tipo: 'foto', chiave: 'a', etichetta: 'A', obbligatoria: true },
  { tipo: 'foto', chiave: 'b', etichetta: 'B', obbligatoria: true },
  { tipo: 'foto', chiave: 'c', etichetta: 'C' },
  { tipo: 'select', chiave: 'eseguito', etichetta: 'Eseguito' },
] as never[];

const PH = 'blob-locale:11111111-1111-1111-1111-111111111111';
const PATH = 'rapportini/r1/a.jpg';

describe('contaFotoObbligatorieMancanti', () => {
  it('conta solo le obbligatorie con campo vuoto (mai scattate)', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, eseguito: 'SI' } }], campi)).toBe(1);
  });
  it('un segnaposto NON conta come mancante (scattata, in caricamento)', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, b: PH } }], campi)).toBe(0);
  });
  it('un array di soli segnaposto NON conta come mancante', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, b: [PH] } }], campi)).toBe(0);
  });
  it('un array misto (segnaposto + path reale) NON conta come mancante', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: [PH, PATH], b: PATH } }], campi)).toBe(0);
  });
  it('le facoltative non contano', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, b: PATH } }], campi)).toBe(0);
  });
  it('somma su più voci', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH } }, { risposte: {} }], campi)).toBe(3);
  });
  it('voce manuale (creata dal +) → foto non obbligatorie (0 mancanti)', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: {}, manuale: true }], campi)).toBe(0);
  });
  it('voce con esito negativo → foto non obbligatorie (0 mancanti)', () => {
    const campiNeg = [
      { chiave: 'a', etichetta: 'Foto A', tipo: 'foto', obbligatoria: true, ordine: 1 },
      { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 2 },
    ] as never;
    expect(contaFotoObbligatorieMancanti([{ risposte: { assente: true } }], campiNeg)).toBe(0);
  });

  it('foto valvola condizionale: SI senza foto conta, NO non conta', () => {
    const campiValvola = [
      { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1 },
      { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', ordine: 2 },
      { chiave: 'foto_std', etichetta: 'Ante Panoramica', tipo: 'foto', obbligatoria: true, ordine: 3 },
      { chiave: 'sost_valvola', etichetta: 'Sost. Valvola', tipo: 'foto', ordine: 4 },
    ] as never[];
    // Eseguito = SI, valvola = SI, nessuna foto → mancano foto_std + sost_valvola.
    expect(contaFotoObbligatorieMancanti([{ risposte: { eseguito: 'SI', sostituzione_valvola: 'SI', foto_std: PATH } }], campiValvola)).toBe(1);
    expect(contaFotoObbligatorieMancanti([{ risposte: { eseguito: 'SI', sostituzione_valvola: 'SI', foto_std: PATH, sost_valvola: PATH } }], campiValvola)).toBe(0);
    // Eseguito = SI, valvola = NO → la valvola NON è richiesta, ma la foto standard SÌ (fix esito negativo).
    expect(contaFotoObbligatorieMancanti([{ risposte: { eseguito: 'SI', sostituzione_valvola: 'NO' } }], campiValvola)).toBe(1);
    expect(contaFotoObbligatorieMancanti([{ risposte: { eseguito: 'SI', sostituzione_valvola: 'NO', foto_std: PATH } }], campiValvola)).toBe(0);
  });
});

describe('fotoObbligatorieMancantiDettaglio', () => {
  it('elenca per task il titolo e le tipologie di foto mancanti', () => {
    const voci = [
      { nominativo: 'Rossi', risposte: { a: PATH } },   // manca B
      { nominativo: 'Bianchi', risposte: {} },          // mancano A, B
    ];
    expect(fotoObbligatorieMancantiDettaglio(voci, campi, ['nominativo'])).toEqual([
      { index: 0, titolo: 'Rossi', tipi: ['B'] },
      { index: 1, titolo: 'Bianchi', tipi: ['A', 'B'] },
    ]);
  });
  it('salta voci manuali ed esito negativo; voci complete non compaiono', () => {
    const voci = [
      { nominativo: 'OK', risposte: { a: PATH, b: PATH } }, // completa
      { nominativo: 'Man', risposte: {}, manuale: true },   // manuale
    ];
    expect(fotoObbligatorieMancantiDettaglio(voci, campi, ['nominativo'])).toEqual([]);
  });
});
