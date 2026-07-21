import { describe, it, expect } from 'vitest';
import { modelloPlusInConflitto, type ModelloPlusRow } from './modelloPlus';

const row = (id: string, over: Partial<ModelloPlusRow> = {}): ModelloPlusRow => ({
  id, nome: id.toUpperCase(), committente: 'italgas', active: true, solo_manuale: true, riservato_pi: false, ...over,
});

describe('modelloPlusInConflitto — un solo modello "+" attivo per committente', () => {
  it('segnala il conflitto su stesso committente (creazione)', () => {
    const esistenti = [row('mobili')];
    const hit = modelloPlusInConflitto(esistenti, { committente: 'italgas', solo_manuale: true });
    expect(hit?.id).toBe('mobili');
  });
  it('nessun conflitto con se stesso (aggiornamento)', () => {
    const esistenti = [row('mobili')];
    expect(modelloPlusInConflitto(esistenti, { id: 'mobili', committente: 'italgas', solo_manuale: true })).toBeNull();
  });
  it('committente diverso → nessun conflitto', () => {
    const esistenti = [row('mobili')];
    expect(modelloPlusInConflitto(esistenti, { committente: 'acea', solo_manuale: true })).toBeNull();
  });
  it('i riservati (P.I.) non concorrono, né come esistenti né come candidato', () => {
    const esistenti = [row('pi', { riservato_pi: true })];
    expect(modelloPlusInConflitto(esistenti, { committente: 'italgas', solo_manuale: true })).toBeNull();
    const esistenti2 = [row('mobili')];
    expect(modelloPlusInConflitto(esistenti2, { committente: 'italgas', solo_manuale: true, riservato_pi: true })).toBeNull();
  });
  it('gli inattivi non concorrono (archiviati), e un candidato in archiviazione è sempre lecito', () => {
    const esistenti = [row('vecchio', { active: false })];
    expect(modelloPlusInConflitto(esistenti, { committente: 'italgas', solo_manuale: true })).toBeNull();
    const esistenti2 = [row('mobili')];
    expect(modelloPlusInConflitto(esistenti2, { committente: 'italgas', solo_manuale: true, active: false })).toBeNull();
  });
  it('i flussi classici (non manuali) non c\'entrano nulla', () => {
    const esistenti = [row('classico', { solo_manuale: false })];
    expect(modelloPlusInConflitto(esistenti, { committente: 'italgas', solo_manuale: true })).toBeNull();
    expect(modelloPlusInConflitto([row('mobili')], { committente: 'italgas', solo_manuale: false })).toBeNull();
  });
  it('candidato manuale senza committente → nessun vincolo qui (ci pensa erroreCommittenteManuale)', () => {
    expect(modelloPlusInConflitto([row('mobili')], { committente: null, solo_manuale: true })).toBeNull();
  });
});
