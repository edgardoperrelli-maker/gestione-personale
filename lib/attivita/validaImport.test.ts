import { describe, it, expect } from 'vitest';
import { validaImport } from './validaImport';
import { buildTassonomiaIndex, type TassonomiaRiga } from './tassonomia';
import type { Task } from '@/utils/routing/types';

const T = (over: Partial<Task>): Task => ({
  id: 'row-1', ordine: 1, odl: '1', indirizzo: 'VIA DI PROVA 1', cap: '00000', citta: 'COMUNE DEMO',
  priorita: 0, fascia_oraria: '', ...over,
} as Task);

const index = buildTassonomiaIndex([
  { committente: 'acea', descrizione: 'Limitazione Massiva su Impianto', descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'acea', descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'acea', descrizione: 'Sospensione fornitura', descrizioneNorm: 'SOSPENSIONE FORNITURA', gruppo: 'DUNNING', attivo: true },
] as TassonomiaRiga[]);

describe('validaImport', () => {
  it('file valido: righe arricchite con canonica e gruppo', () => {
    const esito = validaImport([T({ attivita: ' limitazione massiva su impianto ' })], 'acea', index);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.righe[0].descrizioneCanonica).toBe('Limitazione Massiva su Impianto');
      expect(esito.righe[0].gruppo).toBe('LIMITAZIONI MASSIVE');
    }
  });
  it('descrizione mancante → errore con righe (1-based dal campo ordine)', () => {
    const esito = validaImport([T({ attivita: '' }), T({ ordine: 2, attivita: undefined })], 'acea', index);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori[0].tipo).toBe('descrizione_mancante');
      expect(esito.errori[0].righe).toEqual([1, 2]);
    }
  });
  it('descrizione sconosciuta → errore aggregato per valore', () => {
    const esito = validaImport(
      [T({ attivita: 'ATTIVITA INVENTATA' }), T({ ordine: 2, attivita: 'attivita inventata' })],
      'acea', index,
    );
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori).toHaveLength(1);
      expect(esito.errori[0].tipo).toBe('descrizione_sconosciuta');
      expect(esito.errori[0].righe).toEqual([1, 2]);
    }
  });
  it('gruppo del file incoerente col derivato → errore con atteso', () => {
    const esito = validaImport([T({ attivita: 'Sospensione fornitura', gruppoFile: 'LIMITAZIONI MASSIVE' })], 'acea', index);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori[0].tipo).toBe('gruppo_incoerente');
      expect(esito.errori[0].atteso).toBe('DUNNING');
    }
  });
  it('gruppo del file uguale (case-insensitive) → ok', () => {
    const esito = validaImport([T({ attivita: 'Sospensione fornitura', gruppoFile: 'dunning' })], 'acea', index);
    expect(esito.ok).toBe(true);
  });
  it('UN solo errore invalida TUTTO il file (nessun parziale)', () => {
    const esito = validaImport(
      [T({ attivita: 'Sospensione fornitura' }), T({ ordine: 2, attivita: 'IGNOTA' })],
      'acea', index,
    );
    expect(esito.ok).toBe(false);
  });

  it('auto-allineamento: typo noto riscritto canonico invece di rifiutare (+ report)', () => {
    const esito = validaImport(
      [T({ attivita: 'LIMITAZIONI MASSICE' }), T({ ordine: 2, attivita: 'limitazioni massice' })],
      'acea', index,
    );
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.righe.every((r) => r.descrizioneCanonica === 'LIMITAZIONI MASSIVE')).toBe(true);
      expect(esito.allineate).toEqual([{ da: 'LIMITAZIONI MASSICE', a: 'LIMITAZIONI MASSIVE', righe: [1, 2] }]);
    }
  });
  it('variante valida (solo case/spazi) NON è segnalata come allineamento', () => {
    const esito = validaImport([T({ attivita: ' limitazione   massiva SU impianto ' })], 'acea', index);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.allineate).toEqual([]);
  });
  it('descrizione sconosciuta VERA resta bloccata (no auto-align di fantasia)', () => {
    expect(validaImport([T({ attivita: 'ATTIVITA INVENTATA' })], 'acea', index).ok).toBe(false);
  });
});
