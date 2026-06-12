import { describe, it, expect } from 'vitest';
import { campiObbligatoriMancanti } from './campiObbligatoriMancanti';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campo = (over: Partial<TemplateCampo>): TemplateCampo => ({
  chiave: 'c', etichetta: 'C', tipo: 'testo', ordine: 1, ...over,
});

describe('campiObbligatoriMancanti', () => {
  it('testo/select obbligatori vuoti → mancanti; foto e non-obbligatori ignorati', () => {
    const campi = [
      campo({ chiave: 'nota', etichetta: 'Nota', tipo: 'testo', obbligatoria: true }),
      campo({ chiave: 'esito', etichetta: 'Esito', tipo: 'select', obbligatoria: true }),
      campo({ chiave: 'foto1', etichetta: 'Foto', tipo: 'foto', obbligatoria: true }),
      campo({ chiave: 'fac', etichetta: 'Facolt', tipo: 'testo' }),
    ];
    expect(campiObbligatoriMancanti(campi, {})).toEqual(['Nota', 'Esito']);
  });

  it('crocetta obbligatoria: mancante se non true', () => {
    const campi = [campo({ chiave: 'fatto', etichetta: 'Fatto', tipo: 'crocetta', obbligatoria: true })];
    expect(campiObbligatoriMancanti(campi, {})).toEqual(['Fatto']);
    expect(campiObbligatoriMancanti(campi, { fatto: false })).toEqual(['Fatto']);
    expect(campiObbligatoriMancanti(campi, { fatto: true })).toEqual([]);
  });

  it('numero: 0 NON è mancante; vuoto/assente sì', () => {
    const campi = [campo({ chiave: 'q', etichetta: 'Q', tipo: 'numero', obbligatoria: true })];
    expect(campiObbligatoriMancanti(campi, { q: 0 })).toEqual([]);
    expect(campiObbligatoriMancanti(campi, { q: '' })).toEqual(['Q']);
    expect(campiObbligatoriMancanti(campi, {})).toEqual(['Q']);
  });

  it('tutti compilati → []', () => {
    const campi = [campo({ chiave: 'nota', etichetta: 'Nota', tipo: 'testo', obbligatoria: true })];
    expect(campiObbligatoriMancanti(campi, { nota: 'ok' })).toEqual([]);
  });
});
