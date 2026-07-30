import { describe, it, expect } from 'vitest';
import { attivitaDefaultManuale } from './attivitaPerCommittente';
import { buildTassonomiaIndex, risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

describe('attivitaDefaultManuale', () => {
  it('lim_massive → LIMITAZIONI MASSIVE', () => {
    expect(attivitaDefaultManuale('lim_massive')).toBe('LIMITAZIONI MASSIVE');
  });
  it('acqualatina → la DESCRIZIONE, al singolare (non il gruppo)', () => {
    expect(attivitaDefaultManuale('acqualatina')).toBe('Sostituzione misuratore');
  });
  it('altri committenti → undefined (il personale la sceglie)', () => {
    expect(attivitaDefaultManuale('acea')).toBeUndefined();
    expect(attivitaDefaultManuale('italgas')).toBeUndefined();
    expect(attivitaDefaultManuale('altro')).toBeUndefined();
  });
});

/**
 * Il valore di default non deve solo essere «giusto a vedersi»: deve RISOLVERE in tassonomia.
 * Il POST di /intervento-manuale lo passa a `risolviGruppo` e, se torna null, risponde
 * `attivita_sconosciuta` — cioè ogni "+" di quel committente viene rifiutato.
 *
 * La trappola è che `risolviGruppo` cerca fra le DESCRIZIONI: su ACEA il default funziona
 * perché «LIMITAZIONI MASSIVE» è insieme gruppo e descrizione, mentre su AcquaLatina il
 * gruppo è al plurale e la descrizione al singolare. Righe di fixture prese dal prod.
 */
describe('il default risolve davvero in tassonomia', () => {
  const R = (committente: string, descrizione: string, descrizioneNorm: string, gruppo: string): TassonomiaRiga =>
    ({ committente, descrizione, descrizioneNorm, gruppo, attivo: true }) as TassonomiaRiga;

  const index = buildTassonomiaIndex([
    // Unica riga acqualatina in produzione al 30/07/2026.
    R('acqualatina', 'Sostituzione misuratore', 'SOSTITUZIONE MISURATORE', 'SOSTITUZIONE MISURATORI'),
    R('acea', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE'),
  ]);

  it('acqualatina: il default trova la sua riga', () => {
    const ris = risolviGruppo('acqualatina', attivitaDefaultManuale('acqualatina'), index, { allinea: 'scrittura' });
    expect(ris?.gruppo).toBe('SOSTITUZIONE MISURATORI');
  });

  it('il GRUPPO al plurale NON risolve: è l’errore da non rifare', () => {
    expect(risolviGruppo('acqualatina', 'SOSTITUZIONE MISURATORI', index, { allinea: 'scrittura' })).toBeNull();
  });

  it('lim_massive: il default trova la riga acea (equivalenza di canale)', () => {
    const ris = risolviGruppo('lim_massive', attivitaDefaultManuale('lim_massive'), index, { allinea: 'scrittura' });
    expect(ris?.gruppo).toBe('LIMITAZIONI MASSIVE');
  });
});
