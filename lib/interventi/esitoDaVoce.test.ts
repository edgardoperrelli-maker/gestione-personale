import { describe, it, expect } from 'vitest';
import { decisioneScritturaEsito, esitoInterventoDaVoce, patchInterventoLiveDaVoce } from './esitoDaVoce';
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
  it('rossa (NO) senza nota → completa con esito null e motivo null', () => {
    expect(patchInterventoLiveDaVoce({ eseguito: 'NO' }, campi)).toEqual({
      azione: 'completa', esito: null, esito_motivo: null,
    });
  });
  it('neutro (vuoto) → riapri', () => {
    expect(patchInterventoLiveDaVoce({}, campi)).toEqual({ azione: 'riapri' });
  });
});

/*
  IL PUNTO IN CUI IL GATE MORDE DAVVERO.

  Una voce verde non è una spunta grafica: chiude l'intervento (`eseguito_positivo`), e da lì
  scendono la chiusura dell'ordine nel registro AcquaLatina e la riga del misuratore rimosso a
  magazzino. Senza questo test il gate potrebbe restare nel colore e non nella sostanza.
*/
describe('matricola obbligatoria: l\'intervento non si chiude senza', () => {
  const acqualatina: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true, ordine: 1 },
    { chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', obbligatoria: true, ordine: 2 },
    { chiave: 'note', etichetta: 'NOTE', tipo: 'testo', ordine: 3 },
  ];

  it('SI senza matricola → nessun esito: l\'intervento resta aperto', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'SI' }, acqualatina)).toBeNull();
    expect(patchInterventoLiveDaVoce({ eseguito: 'SI' }, acqualatina)).toEqual({ azione: 'riapri' });
  });

  it('SI con matricola → chiude in positivo', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'SI', matricola_nuova: 'AL26A0012345' }, acqualatina))
      .toEqual({ esito: 'eseguito_positivo', esito_motivo: null });
  });

  it('NO col motivo chiude comunque: là la matricola non esiste', () => {
    expect(esitoInterventoDaVoce({ eseguito: 'NO', note: 'UTENTE ASSENTE' }, acqualatina))
      .toEqual({ esito: null, esito_motivo: 'UTENTE ASSENTE' });
  });
});

describe('decisioneScritturaEsito', () => {
  it('il positivo si scrive sempre, comunque stia l\'intervento', () => {
    expect(decisioneScritturaEsito('eseguito_positivo', null, 1)).toEqual({ scrivi: true });
    expect(decisioneScritturaEsito('eseguito_positivo', 'eseguito_positivo', 5)).toEqual({ scrivi: true });
  });

  it('su un intervento non positivo non c\'è niente da proteggere', () => {
    expect(decisioneScritturaEsito(null, null, 3)).toEqual({ scrivi: true });
    expect(decisioneScritturaEsito(null, 'accesso_negato', 3)).toEqual({ scrivi: true });
  });

  /*
    L'AUTOCORREZIONE deve continuare a funzionare: con una voce sola chi scrive è il
    proprietario di quell'esito, e un positivo messo per sbaglio si toglie da lì. È lo stesso
    motivo per cui non basta un `.neq('esito', 'eseguito_positivo')` in coda all'update.
  */
  it('con una voce sola l\'operatore può correggere il proprio positivo', () => {
    expect(decisioneScritturaEsito(null, 'eseguito_positivo', 1)).toEqual({ scrivi: true });
    expect(decisioneScritturaEsito(null, 'eseguito_positivo', 0)).toEqual({ scrivi: true });
  });

  /*
    ODL 12384609, 14/08/2026: LIBERATORI chiude «SI» alle 13:18, PRATESI «NO» alle 13:27 sullo
    STESSO intervento. Prima vinceva l'ultimo a premere invia, su un lavoro che era stato fatto.
  */
  it('con più voci il positivo non si declassa, e si dice perché', () => {
    const d = decisioneScritturaEsito(null, 'eseguito_positivo', 2);
    expect(d.scrivi).toBe(false);
    if (!d.scrivi) {
      expect(d.motivo).toContain('2 voci');
      expect(d.motivo).toContain('non si declassa');
    }
  });
});
