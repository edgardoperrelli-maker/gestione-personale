import { describe, it, expect } from 'vitest';
import { statoEsitoConsuntivo, haEsitoConsuntivo } from './statoEsito';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'] },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('statoEsitoConsuntivo', () => {
  it('SI → positivo', () => expect(statoEsitoConsuntivo({ eseguito: 'SI' }, campi)).toBe('positivo'));
  it('NO senza nota → negativo (a differenza del flusso operatore)', () =>
    expect(statoEsitoConsuntivo({ eseguito: 'NO' }, campi)).toBe('negativo'));
  it('NO con nota → negativo', () =>
    expect(statoEsitoConsuntivo({ eseguito: 'NO', note: 'ASSENTE' }, campi)).toBe('negativo'));
  it('NESSUN PASSAGGIO → negativo', () =>
    expect(statoEsitoConsuntivo({ eseguito: 'NESSUN PASSAGGIO' }, campi)).toBe('negativo'));
  it('nessuna scelta → da_esitare', () => expect(statoEsitoConsuntivo({}, campi)).toBe('da_esitare'));
});

describe('haEsitoConsuntivo', () => {
  it('true per positivo e per negativo (anche senza nota)', () => {
    expect(haEsitoConsuntivo({ eseguito: 'SI' }, campi)).toBe(true);
    expect(haEsitoConsuntivo({ eseguito: 'NO' }, campi)).toBe(true);
    expect(haEsitoConsuntivo({ eseguito: 'NESSUN PASSAGGIO' }, campi)).toBe(true);
  });
  it('false quando non c\'è esito', () => expect(haEsitoConsuntivo({}, campi)).toBe(false));
});
