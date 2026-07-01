import { describe, it, expect } from 'vitest';
import { attivitaCanonica, aliasKey, type AliasRiga } from './attivitaCanonica';

function mappa(righe: AliasRiga[]): Map<string, AliasRiga> {
  const m = new Map<string, AliasRiga>();
  for (const r of righe) m.set(aliasKey(r.committenteOrig, r.chiave), r);
  return m;
}

const ALIAS = mappa([
  { committenteOrig: 'acea', chiave: 'LIMITAZIONE MASSIVA', committenteEff: 'acea', macrogruppo: 'DUNNING', attivitaPulita: 'Limitazione massiva', voce: 10, attivo: true },
  { committenteOrig: 'acea', chiave: 'S-PR-003 A SONDA', committenteEff: 'italgas', macrogruppo: 'Attività alla clientela', attivitaPulita: 'S-PR-003 A', voce: null, attivo: true },
  { committenteOrig: 'acea', chiave: 'DUNNING', committenteEff: 'acea', macrogruppo: 'Scartare', attivitaPulita: 'DUNNING', voce: null, attivo: false },
  { committenteOrig: 'lim_massive', chiave: 'LIMITAZIONI MASSIVE', committenteEff: 'acea', macrogruppo: 'LIMITAZIONI MASSIVE', attivitaPulita: 'Limitazione massiva', voce: 10, attivo: true },
]);

describe('attivitaCanonica', () => {
  it('alias: hit su testo (case/accenti/spazi ininfluenti)', () => {
    const r = attivitaCanonica('acea', ' Limitazione  Massiva ', 'ZAGAROLO', ALIAS);
    expect(r).toMatchObject({ committenteEff: 'acea', macrogruppo: 'DUNNING', attivitaPulita: 'Limitazione massiva', voce: 10, attivo: true, fonte: 'alias' });
    expect(r?.attivitaKey).toBe('LIMITAZIONE MASSIVA');
  });

  it('alias: riclassifica il gas su italgas', () => {
    const r = attivitaCanonica('acea', 'S-PR-003 A Sonda', 'ROMA', ALIAS);
    expect(r?.committenteEff).toBe('italgas');
    expect(r?.attivitaPulita).toBe('S-PR-003 A');
    expect(r?.attivitaKey).toBe('S-PR-003 A');
  });

  it('alias: attività scartata mantiene attivo=false', () => {
    const r = attivitaCanonica('acea', 'DUNNING', 'PALESTRINA', ALIAS);
    expect(r?.attivo).toBe(false);
    expect(r?.committenteEff).toBe('acea');
  });

  it('alias: lim_massive riclassificato su acea', () => {
    const r = attivitaCanonica('lim_massive', 'Limitazioni massive', 'ZAGAROLO', ALIAS);
    expect(r?.committenteEff).toBe('acea');
    expect(r?.voce).toBe(10);
  });

  it('fallback: testo non in alias → deriva voce e resta sul committente grezzo', () => {
    const r = attivitaCanonica('acea', 'Sospensione fornitura', 'ROMA', ALIAS);
    expect(r).toMatchObject({ committenteEff: 'acea', voce: 11, attivo: true, fonte: 'fallback' });
    expect(r?.attivitaPulita).toBe('Sospensione fornitura');
  });

  it('senza attività + acea + ZAGAROLO → Limitazione massiva/acea', () => {
    const r = attivitaCanonica('acea', '', 'Zagarolo', ALIAS);
    expect(r).toMatchObject({ committenteEff: 'acea', attivitaPulita: 'Limitazione massiva', voce: 10, fonte: 'comune' });
  });

  it('senza attività + acea + comune estraneo (Umbria) → italgas, non valorizzato', () => {
    const r = attivitaCanonica('acea', null, 'PERUGIA', ALIAS);
    expect(r?.committenteEff).toBe('italgas');
    expect(r?.attivitaKey).toBe('');
  });

  it('senza attività + italgas → Bonifiche extra', () => {
    const r = attivitaCanonica('italgas', '   ', 'CAVE', ALIAS);
    expect(r).toMatchObject({ committenteEff: 'italgas', attivitaPulita: 'Bonifiche extra', fonte: 'comune' });
  });

  it('senza attività + committente ignoto → null (non classificabile)', () => {
    expect(attivitaCanonica('altro', '', '', ALIAS)).toBeNull();
  });
});
