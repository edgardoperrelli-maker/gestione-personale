import { describe, it, expect } from 'vitest';
import { pianificaChiusuraOperatore } from './chiusuraOperatore';

describe('pianificaChiusuraOperatore', () => {
  it('Fatto su intervento assegnato → completato + eseguito_positivo', () => {
    const r = pianificaChiusuraOperatore({ statoCorrente: 'assegnato', committente: 'acea', azione: 'fatto' });
    expect(r).toEqual({
      ok: true,
      patch: { stato: 'completato', esito: 'eseguito_positivo', esito_motivo: null },
    });
  });

  it('Non fatto con causale valida + motivo → completato + causale', () => {
    const r = pianificaChiusuraOperatore({
      statoCorrente: 'assegnato',
      committente: 'acea',
      azione: 'non_fatto',
      causale: 'accesso_negato',
      motivo: 'cancello chiuso',
    });
    expect(r).toEqual({
      ok: true,
      patch: { stato: 'completato', esito: 'accesso_negato', esito_motivo: 'cancello chiuso' },
    });
  });

  it('Non fatto senza causale → errore', () => {
    const r = pianificaChiusuraOperatore({ statoCorrente: 'assegnato', committente: 'acea', azione: 'non_fatto' });
    expect(r.ok).toBe(false);
  });

  it('Non fatto con causale che richiede motivo ma senza motivo → errore', () => {
    const r = pianificaChiusuraOperatore({
      statoCorrente: 'assegnato',
      committente: 'acea',
      azione: 'non_fatto',
      causale: 'accesso_a_vuoto',
    });
    expect(r.ok).toBe(false);
  });

  it('Non fatto con causale non valida per la commessa → errore', () => {
    // contatore_non_trovato non è nel set di italgas
    const r = pianificaChiusuraOperatore({
      statoCorrente: 'assegnato',
      committente: 'italgas',
      azione: 'non_fatto',
      causale: 'contatore_non_trovato',
      motivo: 'x',
    });
    expect(r.ok).toBe(false);
  });

  it('reversibilità: ri-registrazione su intervento già completato è permessa', () => {
    const r = pianificaChiusuraOperatore({ statoCorrente: 'completato', committente: 'acea', azione: 'fatto' });
    expect(r.ok).toBe(true);
  });

  it('rifiuta la chiusura da stati non gestiti dall’operatore', () => {
    expect(pianificaChiusuraOperatore({ statoCorrente: 'da_assegnare', committente: 'acea', azione: 'fatto' }).ok).toBe(false);
    expect(pianificaChiusuraOperatore({ statoCorrente: 'annullato', committente: 'acea', azione: 'fatto' }).ok).toBe(false);
  });
});
