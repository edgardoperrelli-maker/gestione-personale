import { describe, expect, it } from 'vitest';
import { erroreCommittenteManuale } from './templateScheda';

describe('erroreCommittenteManuale', () => {
  it('manuale senza committente → messaggio di errore', () => {
    expect(erroreCommittenteManuale({ solo_manuale: true, committente: null })).toBe(
      'Per i template manuali il committente è obbligatorio',
    );
    expect(erroreCommittenteManuale({ solo_manuale: true, committente: '' })).toBe(
      'Per i template manuali il committente è obbligatorio',
    );
  });
  it('manuale con committente → nessun errore', () => {
    expect(erroreCommittenteManuale({ solo_manuale: true, committente: 'acea' })).toBeNull();
  });
  it('classico senza committente → nessun errore (committente opzionale)', () => {
    expect(erroreCommittenteManuale({ solo_manuale: false, committente: null })).toBeNull();
  });
});
