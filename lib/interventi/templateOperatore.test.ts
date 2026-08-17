// lib/interventi/templateOperatore.test.ts
import { describe, it, expect } from 'vitest';
import { flussoPrevalente } from './templateOperatore';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const TASSONOMIA: TassonomiaRiga[] = [
  { committente: 'italgas', descrizione: 'S-PR-004 A', descrizioneNorm: 'S-PR-004 A', gruppo: "ATTIVITA' ALLA CLIENTELA", attivo: true },
  { committente: 'italgas', descrizione: 'BONIFICHE EXTRA', descrizioneNorm: 'BONIFICHE EXTRA', gruppo: 'BONIFICHE EXTRA', attivo: true },
  { committente: 'acea', descrizione: 'Regolarizzazione flusso idrico', descrizioneNorm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'DUNNING', attivo: true },
];
const index = buildTassonomiaIndex(TASSONOMIA);

const FLUSSI = [
  { id: 'tpl-italgas', nome: 'ITALGAS', gruppo_committente: 'italgas', gruppi_attivita: ["ATTIVITA' ALLA CLIENTELA"] },
  { id: 'tpl-bonifiche', nome: 'BONIFICHE EXTRA', gruppo_committente: 'italgas', gruppi_attivita: ['BONIFICHE EXTRA'] },
  { id: 'tpl-dunning', nome: 'LIMITAZIONI/SOSPENSIONI', gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'] },
];

const classico = { attivita: 'S-PR-004 A' };
const bonifica = { attivita: 'BONIFICHE EXTRA' };

describe('flussoPrevalente', () => {
  it('giro classico → il suo flusso', () => {
    expect(flussoPrevalente([classico, classico], index, FLUSSI)).toBe('tpl-italgas');
  });

  it('il flusso task-via NON vince su un giro che ha anche lavoro classico, nemmeno in maggioranza', () => {
    // Il caso PERUGIA 2026-08-17: le bonifiche superavano in numero le attività classiche e il
    // flusso task-via finiva in testata, trasformando ogni voce classica in un contenitore.
    expect(flussoPrevalente([classico, bonifica, bonifica, bonifica], index, FLUSSI)).toBe('tpl-italgas');
  });

  it('giro fatto SOLO di bonifiche → flusso BONIFICHE EXTRA (comportamento storico)', () => {
    expect(flussoPrevalente([bonifica, bonifica], index, FLUSSI)).toBe('tpl-bonifiche');
  });

  it('fra due flussi classici vince il più rappresentato; a pari merito decide l\'id', () => {
    const acea = { attivita: 'Regolarizzazione flusso idrico' };
    expect(flussoPrevalente([classico, acea, acea], index, FLUSSI)).toBe('tpl-dunning');
    expect(flussoPrevalente([classico, acea], index, FLUSSI)).toBe('tpl-dunning'); // 'tpl-dunning' < 'tpl-italgas'
  });

  it('task classici non classificabili + bonifiche → flusso bonifiche (meglio del nulla)', () => {
    expect(flussoPrevalente([{ attivita: 'FUORI CATALOGO' }, bonifica], index, FLUSSI)).toBe('tpl-bonifiche');
  });

  it('niente di classificabile → null', () => {
    expect(flussoPrevalente([{ attivita: 'FUORI CATALOGO' }, {}], index, FLUSSI)).toBeNull();
    expect(flussoPrevalente([], index, FLUSSI)).toBeNull();
  });
});
