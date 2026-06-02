import { describe, it, expect } from 'vitest';
import {
  transizioneValida,
  statoTerminale,
  esitoRichiedeMotivo,
  esitoAmmessoPerStato,
  esitoEntraNelNumeratoreKpi,
  validaCambioStato,
} from './statoInterventi';

describe('transizioneValida', () => {
  it('accetta il percorso nominale del ciclo di vita', () => {
    expect(transizioneValida('da_assegnare', 'assegnato')).toBe(true);
    expect(transizioneValida('assegnato', 'in_viaggio')).toBe(true);
    expect(transizioneValida('in_viaggio', 'sul_posto')).toBe(true);
    expect(transizioneValida('sul_posto', 'in_esecuzione')).toBe(true);
    expect(transizioneValida('in_esecuzione', 'completato')).toBe(true);
  });

  it('consente la riassegnazione (assegnato → da_assegnare)', () => {
    expect(transizioneValida('assegnato', 'da_assegnare')).toBe(true);
  });

  it('consente annullato da qualsiasi stato non terminale', () => {
    expect(transizioneValida('da_assegnare', 'annullato')).toBe(true);
    expect(transizioneValida('in_esecuzione', 'annullato')).toBe(true);
  });

  it('rifiuta salti e auto-transizioni', () => {
    expect(transizioneValida('da_assegnare', 'in_esecuzione')).toBe(false);
    expect(transizioneValida('assegnato', 'completato')).toBe(false);
    expect(transizioneValida('sul_posto', 'sul_posto')).toBe(false);
  });

  it('rifiuta qualsiasi uscita dagli stati terminali', () => {
    expect(transizioneValida('completato', 'in_esecuzione')).toBe(false);
    expect(transizioneValida('annullato', 'assegnato')).toBe(false);
  });
});

describe('statoTerminale', () => {
  it('riconosce completato e annullato come terminali', () => {
    expect(statoTerminale('completato')).toBe(true);
    expect(statoTerminale('annullato')).toBe(true);
    expect(statoTerminale('assegnato')).toBe(false);
  });
});

describe('esiti', () => {
  it('le causali KO e il rinvio richiedono motivazione, l’esito positivo no', () => {
    expect(esitoRichiedeMotivo('accesso_negato')).toBe(true);
    expect(esitoRichiedeMotivo('accesso_a_vuoto')).toBe(true);
    expect(esitoRichiedeMotivo('rinviato')).toBe(true);
    expect(esitoRichiedeMotivo('eseguito_positivo')).toBe(false);
  });

  it('solo eseguito_positivo entra nel numeratore KPI (accesso a vuoto escluso)', () => {
    expect(esitoEntraNelNumeratoreKpi('eseguito_positivo')).toBe(true);
    expect(esitoEntraNelNumeratoreKpi('accesso_a_vuoto')).toBe(false);
  });

  it('l’esito è ammesso solo su intervento completato', () => {
    expect(esitoAmmessoPerStato('completato')).toBe(true);
    expect(esitoAmmessoPerStato('in_esecuzione')).toBe(false);
  });
});

describe('validaCambioStato', () => {
  it('ok sul percorso valido senza esito', () => {
    expect(validaCambioStato({ da: 'assegnato', a: 'in_viaggio' })).toEqual({ ok: true });
  });

  it('errore su transizione non valida', () => {
    const r = validaCambioStato({ da: 'da_assegnare', a: 'completato' });
    expect(r.ok).toBe(false);
  });

  it('completare richiede un esito', () => {
    const r = validaCambioStato({ da: 'in_esecuzione', a: 'completato' });
    expect(r.ok).toBe(false);
  });

  it('completare con esito KO richiede la motivazione', () => {
    const senza = validaCambioStato({ da: 'in_esecuzione', a: 'completato', esito: 'accesso_negato' });
    expect(senza.ok).toBe(false);
    const con = validaCambioStato({
      da: 'in_esecuzione',
      a: 'completato',
      esito: 'accesso_negato',
      esitoMotivo: 'utente assente',
    });
    expect(con).toEqual({ ok: true });
  });

  it('completare con esito positivo non richiede motivazione', () => {
    expect(validaCambioStato({ da: 'in_esecuzione', a: 'completato', esito: 'eseguito_positivo' })).toEqual({
      ok: true,
    });
  });
});
