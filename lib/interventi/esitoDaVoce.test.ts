import { describe, it, expect } from 'vitest';
import { esitoInterventoDaVoce, patchInterventoLiveDaVoce } from './esitoDaVoce';
import type { TemplateCampo } from '../../utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [{ chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NO'] }];

describe('esitoInterventoDaVoce', () => {
  it('SI → Fatto (eseguito_positivo, nessun motivo)', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'SI' }, campi)).toEqual({ esito: 'eseguito_positivo', esito_motivo: null });
  });
  it('NO + nota → Non fatto con motivo (trim)', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'NO', note: ' Contatore interno ' }, campi)).toEqual({ esito: null, esito_motivo: 'Contatore interno' });
  });
  it('NO senza nota → motivo null', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'NO' }, campi)).toEqual({ esito: null, esito_motivo: null });
  });
  it('nessuna risposta → null (neutro, non chiude)', () => {
    expect(esitoInterventoDaVoce({}, campi)).toBeNull();
  });
});

describe('patchInterventoLiveDaVoce', () => {
  it('verde (SI) → completa con eseguito_positivo', () => {
    expect(patchInterventoLiveDaVoce({ eseguito: 'SI' }, campi)).toEqual({
      azione: 'completa', esito: 'eseguito_positivo', esito_motivo: null,
    });
  });
  it('rossa (NO) + nota → completa con esito null e motivo (trim)', () => {
    expect(patchInterventoLiveDaVoce({ eseguito: 'NO', note: ' Assente ' }, campi)).toEqual({
      azione: 'completa', esito: null, esito_motivo: 'Assente',
    });
  });
  it('neutro (vuoto) → riapri', () => {
    expect(patchInterventoLiveDaVoce({}, campi)).toEqual({ azione: 'riapri' });
  });
});
