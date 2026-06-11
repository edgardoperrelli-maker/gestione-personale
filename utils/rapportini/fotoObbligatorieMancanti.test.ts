import { describe, it, expect } from 'vitest';
import { contaFotoObbligatorieMancanti } from './fotoObbligatorieMancanti';

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
  it('le facoltative non contano', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH, b: PATH } }], campi)).toBe(0);
  });
  it('somma su più voci', () => {
    expect(contaFotoObbligatorieMancanti([{ risposte: { a: PATH } }, { risposte: {} }], campi)).toBe(3);
  });
});
