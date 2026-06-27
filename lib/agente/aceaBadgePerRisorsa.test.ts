import { describe, it, expect } from 'vitest';
import { badgePerRisorsa, cognomeChiave, esitoEffettivoPerOdl } from './aceaBadgePerRisorsa';

describe('esitoEffettivoPerOdl', () => {
  it('l esito REALE batte una Prova più recente (no mascheramento)', () => {
    const m = esitoEffettivoPerOdl([
      { odl: '1', esito: 'fallito', dry_run: false, creato_il: '2026-06-26T10:00:00Z' },
      { odl: '1', esito: 'simulato', dry_run: true, creato_il: '2026-06-26T11:00:00Z' },
    ]);
    expect(m.get('1')?.esito).toBe('fallito');
  });
  it('a parità di tipo (reale/prova) vince il creato_il più recente, robusto all ordine', () => {
    const m = esitoEffettivoPerOdl([
      { odl: '1', esito: 'fallito', dry_run: false, creato_il: '2026-06-26T10:00:00Z' },
      { odl: '1', esito: 'assegnato', dry_run: false, creato_il: '2026-06-26T23:00:00Z' },
    ]);
    expect(m.get('1')?.esito).toBe('assegnato');
  });
  it('una Prova vale solo se non esiste alcun esito reale per quell ODL', () => {
    const m = esitoEffettivoPerOdl([
      { odl: '1', esito: 'simulato', dry_run: true, creato_il: '2026-06-26T11:00:00Z' },
    ]);
    expect(m.get('1')?.esito).toBe('simulato');
    expect(m.get('1')?.dry_run).toBe(true);
  });
  it('salta righe senza odl; input vuoto → mappa vuota', () => {
    expect(esitoEffettivoPerOdl(null).size).toBe(0);
    expect(esitoEffettivoPerOdl([{ odl: '', esito: 'assegnato' }]).size).toBe(0);
  });
});

describe('badgePerRisorsa', () => {
  it('verde se tutti gli ODL della risorsa sono ok (assegnato/gia-assegnato/simulato)', () => {
    const m = badgePerRisorsa([
      { odl: '1', operatore_acea: 'SIKORA', esito: 'assegnato' },
      { odl: '2', operatore_acea: 'SIKORA FRANCO', esito: 'gia-assegnato' },
      { odl: '3', operatore_acea: 'SIKORA', esito: 'simulato' },
    ]);
    expect(m.get('SIKORA')).toEqual({ ok: 3, errore: 0, stato: 'ok' });
  });

  it('rosso se almeno un ODL è in errore (fallito/non assegnato)', () => {
    const m = badgePerRisorsa([
      { odl: '1', operatore_acea: 'DIONISI', esito: 'assegnato' },
      { odl: '2', operatore_acea: 'DIONISI', esito: 'fallito' },
      { odl: '3', operatore_acea: 'DIONISI', esito: 'non assegnato' },
    ]);
    expect(m.get('DIONISI')).toEqual({ ok: 1, errore: 2, stato: 'errore' });
  });

  it('raggruppa per cognome (prima parola, maiuscolo)', () => {
    const m = badgePerRisorsa([
      { odl: '1', operatore_acea: 'Rossi Mario', esito: 'assegnato' },
      { odl: '2', operatore_acea: 'ROSSI', esito: 'fallito' },
    ]);
    expect(m.get('ROSSI')).toEqual({ ok: 1, errore: 1, stato: 'errore' });
  });

  it('dedup per ODL: tiene l esito con creato_il più recente', () => {
    const m = badgePerRisorsa([
      { odl: '1', operatore_acea: 'SIKORA', esito: 'fallito', creato_il: '2026-06-26T10:00:00Z' },
      { odl: '1', operatore_acea: 'SIKORA', esito: 'assegnato', creato_il: '2026-06-26T23:00:00Z' },
    ]);
    expect(m.get('SIKORA')).toEqual({ ok: 1, errore: 0, stato: 'ok' });
  });

  it('input vuoto/nullo → mappa vuota', () => {
    expect(badgePerRisorsa(null).size).toBe(0);
    expect(badgePerRisorsa([]).size).toBe(0);
  });

  it('cognomeChiave espone la stessa normalizzazione per il join lato UI', () => {
    expect(cognomeChiave('Sikora Franco')).toBe('SIKORA');
    expect(cognomeChiave('  dionisi ')).toBe('DIONISI');
    expect(cognomeChiave('')).toBe('');
  });
});
