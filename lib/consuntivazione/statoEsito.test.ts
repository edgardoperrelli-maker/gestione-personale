import { describe, it, expect } from 'vitest';
import { statoEsitoConsuntivo, esitabileConsuntivo, notaNegativoMancante } from './statoEsito';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'] },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('statoEsitoConsuntivo (badge)', () => {
  it('SI → positivo', () => expect(statoEsitoConsuntivo({ eseguito: 'SI' }, campi)).toBe('positivo'));
  it('NO senza nota → negativo (l\'esito è scelto)', () =>
    expect(statoEsitoConsuntivo({ eseguito: 'NO' }, campi)).toBe('negativo'));
  it('NESSUN PASSAGGIO → negativo', () =>
    expect(statoEsitoConsuntivo({ eseguito: 'NESSUN PASSAGGIO' }, campi)).toBe('negativo'));
  it('nessuna scelta → da_esitare', () => expect(statoEsitoConsuntivo({}, campi)).toBe('da_esitare'));
});

describe('esitabileConsuntivo (gate) + notaNegativoMancante', () => {
  it('SI → esitabile', () => {
    expect(esitabileConsuntivo({ eseguito: 'SI' }, campi)).toBe(true);
    expect(notaNegativoMancante({ eseguito: 'SI' }, campi)).toBe(false);
  });
  it('NO senza nota → NON esitabile, nota mancante', () => {
    expect(esitabileConsuntivo({ eseguito: 'NO' }, campi)).toBe(false);
    expect(notaNegativoMancante({ eseguito: 'NO' }, campi)).toBe(true);
  });
  it('NO con nota → esitabile', () => {
    expect(esitabileConsuntivo({ eseguito: 'NO', note: 'ACCESSO NEGATO' }, campi)).toBe(true);
    expect(notaNegativoMancante({ eseguito: 'NO', note: 'ACCESSO NEGATO' }, campi)).toBe(false);
  });
  it('NESSUN PASSAGGIO → esitabile senza nota (auto-esplicativo)', () => {
    expect(esitabileConsuntivo({ eseguito: 'NESSUN PASSAGGIO' }, campi)).toBe(true);
    expect(notaNegativoMancante({ eseguito: 'NESSUN PASSAGGIO' }, campi)).toBe(false);
  });
  it('nessun esito → NON esitabile, non è "nota mancante"', () => {
    expect(esitabileConsuntivo({}, campi)).toBe(false);
    expect(notaNegativoMancante({}, campi)).toBe(false);
  });
});
