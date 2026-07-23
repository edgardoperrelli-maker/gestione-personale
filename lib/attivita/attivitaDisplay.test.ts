import { describe, it, expect } from 'vitest';
import { attivitaUnificataDisplay } from './attivitaDisplay';

describe('attivitaUnificataDisplay', () => {
  it('collassa le varianti dei codici al codice nudo', () => {
    expect(attivitaUnificataDisplay('S-PR-003 A')).toBe('S-PR-003');
    expect(attivitaUnificataDisplay('S-PR-003 A Sonda')).toBe('S-PR-003');
    expect(attivitaUnificataDisplay('S-PR-003 B')).toBe('S-PR-003');
    expect(attivitaUnificataDisplay('S-MR-002 C')).toBe('S-MR-002');
    expect(attivitaUnificataDisplay('DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO')).toBe('DIS00N');
    expect(attivitaUnificataDisplay('S-AI-022 - SOST PROG CONT ATTIVO < G6 PER TELELETTURA GN B')).toBe('S-AI-022');
  });
  it('il codice nudo resta invariato', () => {
    expect(attivitaUnificataDisplay('S-PR-003')).toBe('S-PR-003');
    expect(attivitaUnificataDisplay('DIS00N')).toBe('DIS00N');
  });
  it('lascia invariate le attività NON collassate', () => {
    expect(attivitaUnificataDisplay('Limitazione flusso idrico')).toBe('Limitazione flusso idrico');
    expect(attivitaUnificataDisplay('BONIFICHE EXTRA')).toBe('BONIFICHE EXTRA');
    expect(attivitaUnificataDisplay('DIS001 - Disattivazione primo passaggio')).toBe('DIS001 - Disattivazione primo passaggio'); // singolo, non collassato
    expect(attivitaUnificataDisplay('S-AI-050 - Cambio forzato')).toBe('S-AI-050 - Cambio forzato'); // singolo
    expect(attivitaUnificataDisplay('LIMITAZIONI MASSIVE')).toBe('LIMITAZIONI MASSIVE');
  });
  it('gestisce vuoto/null', () => {
    expect(attivitaUnificataDisplay('')).toBe('');
    expect(attivitaUnificataDisplay(null)).toBe('');
    expect(attivitaUnificataDisplay(undefined)).toBe('');
  });
});
