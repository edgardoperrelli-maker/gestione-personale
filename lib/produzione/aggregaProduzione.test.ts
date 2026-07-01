import { describe, expect, it } from 'vitest';
import { aggregaProduzione, deduplicaMassivePerMatricola, type RigaProduzione } from './aggregaProduzione';

const base: RigaProduzione = {
  odl: '1',
  voce: 10,
  kpi: 'EL',
  attivitaKey: 'LIMITAZIONE FLUSSO IDRICO',
  attivitaLabel: 'Limitazione flusso idrico',
  data: '2026-06-01',
  staffId: 's1',
  operatore: 'ROSSI',
  territorioId: 't1',
  territorio: 'Roma',
  valore: 10,
};
const riga = (o: Partial<RigaProduzione>): RigaProduzione => ({ ...base, ...o });

describe('aggregaProduzione', () => {
  it('insieme vuoto → totali a zero, niente gruppi', () => {
    const a = aggregaProduzione([]);
    expect(a.totale).toEqual({ conteggio: 0, valore: 0 });
    expect(a.perVoce).toEqual([]);
    expect(a.perOperatore).toEqual([]);
    expect(a.perTerritorio).toEqual([]);
    expect(a.perGiorno).toEqual([]);
    expect(a.nonRisolte).toBe(0);
  });

  it('somma conteggio e valore totali', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', valore: 10 }),
      riga({ odl: '2', valore: 5.5 }),
    ]);
    expect(a.totale).toEqual({ conteggio: 2, valore: 15.5 });
  });

  it('aggrega per voce in ordine EL/ES/ERC/ERA, includendo solo le voci presenti', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', voce: 11, kpi: 'ES', valore: 5 }),
      riga({ odl: '2', voce: 10, kpi: 'EL', valore: 10 }),
      riga({ odl: '3', voce: 10, kpi: 'EL', valore: 10 }),
    ]);
    expect(a.perVoce.map((v) => v.chiave)).toEqual(['EL', 'ES']);
    expect(a.perVoce[0]).toMatchObject({ chiave: 'EL', conteggio: 2, valore: 20 });
    expect(a.perVoce[1]).toMatchObject({ chiave: 'ES', conteggio: 1, valore: 5 });
  });

  it('le voci non risolte finiscono in NON_RISOLTA (in coda) e in nonRisolte', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', voce: 10, kpi: 'EL', valore: 10 }),
      riga({ odl: '2', voce: null, kpi: null, valore: 0 }),
      riga({ odl: '3', voce: null, kpi: null, valore: 0 }),
    ]);
    expect(a.perVoce.map((v) => v.chiave)).toEqual(['EL', 'NON_RISOLTA']);
    expect(a.perVoce[1]).toMatchObject({ chiave: 'NON_RISOLTA', conteggio: 2, valore: 0 });
    expect(a.nonRisolte).toBe(2);
  });

  it('aggrega per operatore (label = nome) ordinato per valore desc', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', staffId: 's1', operatore: 'ROSSI', valore: 5 }),
      riga({ odl: '2', staffId: 's2', operatore: 'VERDI', valore: 30 }),
      riga({ odl: '3', staffId: 's1', operatore: 'ROSSI', valore: 5 }),
    ]);
    expect(a.perOperatore.map((o) => o.label)).toEqual(['VERDI', 'ROSSI']);
    expect(a.perOperatore[1]).toMatchObject({ chiave: 's1', label: 'ROSSI', conteggio: 2, valore: 10 });
  });

  it('aggrega per giorno ordinato per data crescente', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', data: '2026-06-03', valore: 1 }),
      riga({ odl: '2', data: '2026-06-01', valore: 2 }),
      riga({ odl: '3', data: '2026-06-01', valore: 3 }),
    ]);
    expect(a.perGiorno.map((g) => g.chiave)).toEqual(['2026-06-01', '2026-06-03']);
    expect(a.perGiorno[0]).toMatchObject({ chiave: '2026-06-01', conteggio: 2, valore: 5 });
  });

  it('aggrega per ATTIVITÀ (label leggibile) ordinato per valore desc', () => {
    const a = aggregaProduzione([
      riga({ odl: '1', attivitaKey: 'LIMITAZIONE FLUSSO IDRICO', attivitaLabel: 'Limitazione flusso idrico', valore: 5 }),
      riga({ odl: '2', attivitaKey: 'SOSPENSIONE FORNITURA', attivitaLabel: 'Sospensione fornitura', valore: 30 }),
      riga({ odl: '3', attivitaKey: 'LIMITAZIONE FLUSSO IDRICO', attivitaLabel: 'Limitazione flusso idrico', valore: 5 }),
    ]);
    expect(a.perAttivita.map((x) => x.label)).toEqual(['Sospensione fornitura', 'Limitazione flusso idrico']);
    expect(a.perAttivita[1]).toMatchObject({ chiave: 'LIMITAZIONE FLUSSO IDRICO', conteggio: 2, valore: 10 });
  });
});

describe('deduplicaMassivePerMatricola', () => {
  it('collassa le LIMITAZIONE MASSIVA con la stessa matricola in una sola riga', () => {
    const out = deduplicaMassivePerMatricola([
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: 'M1', odl: 'A' }),
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: 'M1', odl: 'B' }), // stessa matricola → duplicato
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: 'M2', odl: 'C' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.matricola).sort()).toEqual(['M1', 'M2']);
  });

  it('quando la matricola manca, deduplica per ODL', () => {
    const out = deduplicaMassivePerMatricola([
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: '', odl: 'A' }),
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: '', odl: 'A' }), // stesso ODL → duplicato
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: '', odl: 'B' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('non tocca le voci diverse dalla limitazione massiva', () => {
    const out = deduplicaMassivePerMatricola([
      riga({ attivitaKey: 'LIMITAZIONE EROGAZIONE', matricola: 'M1', odl: 'A' }),
      riga({ attivitaKey: 'LIMITAZIONE EROGAZIONE', matricola: 'M1', odl: 'B' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('preserva le righe massive prive sia di matricola sia di ODL (non le collassa)', () => {
    const out = deduplicaMassivePerMatricola([
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: '', odl: '' }),
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: '', odl: '' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('mantiene una sola riga massiva per matricola anche mescolata ad altre voci', () => {
    const out = deduplicaMassivePerMatricola([
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: 'M1', odl: 'A' }),
      riga({ attivitaKey: 'SOSTITUZIONE SARACINESCA', matricola: 'M1', odl: 'A' }),
      riga({ attivitaKey: 'LIMITAZIONE MASSIVA', matricola: 'M1', odl: 'A' }),
    ]);
    // 1 massiva (M1) + 1 saracinesca (non toccata) = 2
    expect(out).toHaveLength(2);
    expect(out.filter((r) => r.attivitaKey === 'LIMITAZIONE MASSIVA')).toHaveLength(1);
  });
});
