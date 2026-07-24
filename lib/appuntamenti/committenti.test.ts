import { describe, it, expect } from 'vitest';
import {
  coloreCommittente,
  territoriAttivi,
  committentiAttivi,
  type AppuntamentoCommittente,
} from './committenti';

const terr = (id: string, nome: string, attivo = true): AppuntamentoCommittente['territori'][number] =>
  ({ id, committente_id: 'c1', nome, attivo });

describe('coloreCommittente', () => {
  it('senza chiave ritorna il grigio ardesia', () => {
    expect(coloreCommittente('')).toBe('var(--chart-7)');
    expect(coloreCommittente(null)).toBe('var(--chart-7)');
  });
  it('è stabile per la stessa chiave', () => {
    expect(coloreCommittente('AcquaLatina')).toBe(coloreCommittente('AcquaLatina'));
  });
  it('resta nella scala chart-1..8', () => {
    for (const s of ['AcquaLatina', 'ACEA', 'Italgas', 'x', 'z-9', 'Comune di Terracina']) {
      expect(coloreCommittente(s)).toMatch(/^var\(--chart-[1-8]\)$/);
    }
  });
});

describe('territoriAttivi', () => {
  const c: AppuntamentoCommittente = {
    id: 'c1', nome: 'AcquaLatina', attivo: true,
    territori: [terr('t2', 'Terracina'), terr('t3', 'Aprilia', false), terr('t1', 'Fondi')],
  };
  it('esclude i disattivati e ordina per nome', () => {
    expect(territoriAttivi(c).map((t) => t.nome)).toEqual(['Fondi', 'Terracina']);
  });
  it('committente assente → lista vuota', () => {
    expect(territoriAttivi(null)).toEqual([]);
  });
});

describe('committentiAttivi', () => {
  it('esclude i disattivati e ordina per nome', () => {
    const rows: AppuntamentoCommittente[] = [
      { id: 'c2', nome: 'Zeta', attivo: true, territori: [] },
      { id: 'c3', nome: 'Beta', attivo: false, territori: [] },
      { id: 'c1', nome: 'AcquaLatina', attivo: true, territori: [] },
    ];
    expect(committentiAttivi(rows).map((c) => c.nome)).toEqual(['AcquaLatina', 'Zeta']);
  });
});
