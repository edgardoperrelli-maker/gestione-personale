import { describe, it, expect } from 'vitest';
import {
  schedaDiTemplate,
  filtraTemplatePerScheda,
  erroreCommittenteManuale,
} from './templateScheda';

describe('schedaDiTemplate', () => {
  it('solo_manuale=true → scheda manuali', () => {
    expect(schedaDiTemplate({ solo_manuale: true })).toBe('manuali');
  });
  it('solo_manuale=false → scheda classici', () => {
    expect(schedaDiTemplate({ solo_manuale: false })).toBe('classici');
  });
  it('solo_manuale assente/null → scheda classici (default storico)', () => {
    expect(schedaDiTemplate({})).toBe('classici');
    expect(schedaDiTemplate({ solo_manuale: null })).toBe('classici');
  });
});

describe('filtraTemplatePerScheda', () => {
  const list = [
    { id: 'a', solo_manuale: false },
    { id: 'b', solo_manuale: true },
    { id: 'c' },
    { id: 'd', solo_manuale: true },
  ];
  it('classici = solo_manuale falsy', () => {
    expect(filtraTemplatePerScheda(list, 'classici').map((t) => t.id)).toEqual(['a', 'c']);
  });
  it('manuali = solo_manuale true', () => {
    expect(filtraTemplatePerScheda(list, 'manuali').map((t) => t.id)).toEqual(['b', 'd']);
  });
  it('non muta l\'array di input', () => {
    const copia = [...list];
    filtraTemplatePerScheda(list, 'manuali');
    expect(list).toEqual(copia);
  });
});

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
