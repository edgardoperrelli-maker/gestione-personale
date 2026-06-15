import { describe, it, expect } from 'vitest';
import { esitoPositivoDefault } from './esitoPositivoDefault';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('esitoPositivoDefault', () => {
  it('imposta eseguito alla prima opzione positiva quando vuoto', () => {
    expect(esitoPositivoDefault(campi, {})).toEqual({ eseguito: 'SI' });
    expect(esitoPositivoDefault(campi, { note: 'x' })).toEqual({ note: 'x', eseguito: 'SI' });
  });
  it('non sovrascrive un eseguito già scelto (anche se NO)', () => {
    expect(esitoPositivoDefault(campi, { eseguito: 'NO' })).toEqual({ eseguito: 'NO' });
    expect(esitoPositivoDefault(campi, { eseguito: 'SI' })).toEqual({ eseguito: 'SI' });
  });
  it('sceglie l opzione positiva anche se l etichetta non è "SI"', () => {
    const c: TemplateCampo[] = [{ chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['NO', 'Fatto'], ordine: 1 }];
    expect(esitoPositivoDefault(c, {})).toEqual({ eseguito: 'Fatto' });
  });
  it('no-op se il template non ha un select "eseguito"', () => {
    const c: TemplateCampo[] = [{ chiave: 'sost', etichetta: 'Sost', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 }];
    expect(esitoPositivoDefault(c, {})).toEqual({});
  });
});
