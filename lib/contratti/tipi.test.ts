import { describe, it, expect } from 'vitest';
import {
  territoriAttivi,
  contrattiAttivi,
  committentiAttivi,
  territoriDelCommittente,
  contrattoInCorso,
  statoContratto,
  coloreCommittente,
  tariffaAllaData,
  type Contratto,
  type Committente,
  type ContrattoTerritorio,
  type RigaListino,
} from './tipi';

const terr = (over: Partial<ContrattoTerritorio> = {}): ContrattoTerritorio => ({
  id: 't1', contratto_id: 'k1', nome: 'Terracina', territory_id: null, attivo: true, ...over,
});

const contratto = (over: Partial<Contratto> = {}): Contratto => ({
  id: 'k1', committente_id: 'c1', nome: 'Commessa AcquaLatina',
  valido_dal: '2026-07-29', valido_al: '2027-07-31', attivo: true, note: null, territori: [], ...over,
});

const committente = (over: Partial<Committente> = {}): Committente => ({
  id: 'c1', nome: 'AcquaLatina', codice: 'acqualatina', attivo: true, contratti: [], ...over,
});

describe('territoriAttivi', () => {
  it('filtra i disattivati e ordina per nome (accenti-insensibile)', () => {
    const k = contratto({
      territori: [
        terr({ id: 'a', nome: 'Sperlonga' }),
        terr({ id: 'b', nome: 'Fondi', attivo: false }),
        terr({ id: 'c', nome: 'Èboli' }),
      ],
    });
    expect(territoriAttivi(k).map((t) => t.nome)).toEqual(['Èboli', 'Sperlonga']);
  });

  it('contratto assente → lista vuota', () => {
    expect(territoriAttivi(null)).toEqual([]);
    expect(territoriAttivi(undefined)).toEqual([]);
  });
});

describe('contrattiAttivi / committentiAttivi', () => {
  it('filtrano i sospesi e ordinano per nome', () => {
    const c = committente({
      contratti: [contratto({ id: 'z', nome: 'Zona sud' }), contratto({ id: 'a', nome: 'Anzio', attivo: false })],
    });
    expect(contrattiAttivi(c).map((k) => k.nome)).toEqual(['Zona sud']);
    expect(committentiAttivi([committente({ nome: 'Italgas' }), committente({ nome: 'ACEA' })]).map((x) => x.nome))
      .toEqual(['ACEA', 'Italgas']);
  });
});

describe('contrattoInCorso / statoContratto', () => {
  it('la commessa AcquaLatina parte il 29/07: il 27 è futura, il 29 è in corso', () => {
    const k = contratto();
    expect(contrattoInCorso(k, '2026-07-27')).toBe(false);
    expect(statoContratto(k, '2026-07-27')).toBe('futuro');
    expect(contrattoInCorso(k, '2026-07-29')).toBe(true);
    expect(statoContratto(k, '2026-07-29')).toBe('in-corso');
  });

  it('estremi inclusi su entrambi i lati', () => {
    expect(contrattoInCorso(contratto(), '2027-07-31')).toBe(true);
    expect(statoContratto(contratto(), '2027-08-01')).toBe('scaduto');
  });

  it('estremo null = aperto da quel lato', () => {
    expect(contrattoInCorso(contratto({ valido_dal: null, valido_al: null }), '1999-01-01')).toBe(true);
    expect(contrattoInCorso(contratto({ valido_al: null }), '2050-01-01')).toBe(true);
  });

  it('contratto sospeso: mai in corso, a prescindere dalle date', () => {
    const k = contratto({ attivo: false });
    expect(contrattoInCorso(k, '2026-08-01')).toBe(false);
    expect(statoContratto(k, '2026-08-01')).toBe('sospeso');
  });
});

describe('coloreCommittente', () => {
  it('stabile per la stessa chiave e sempre nella scala --chart-1..8', () => {
    for (const s of ['acqualatina', 'acea', 'italgas', 'x']) {
      expect(coloreCommittente(s)).toBe(coloreCommittente(s));
      expect(coloreCommittente(s)).toMatch(/^var\(--chart-[1-8]\)$/);
    }
  });

  it('chiave vuota → grigio ardesia', () => {
    expect(coloreCommittente('')).toBe('var(--chart-7)');
    expect(coloreCommittente(null)).toBe('var(--chart-7)');
  });
});

describe('tariffaAllaData', () => {
  const riga = (over: Partial<RigaListino> = {}): RigaListino => ({
    id: 'r1', contratto_id: 'k1', attivita: 'SOSTITUZIONE MISURATORE', etichetta: 'Sostituzione misuratore',
    azione_chiave: null, prezzo: 10, valido_dal: '2026-01-01', valido_al: null, attivo: true, note: null, ...over,
  });

  it('fra più validità vince la più recente non futura', () => {
    const righe = [
      riga({ id: 'vecchia', prezzo: 10, valido_dal: '2026-01-01' }),
      riga({ id: 'nuova', prezzo: 12, valido_dal: '2026-07-01' }),
      riga({ id: 'futura', prezzo: 15, valido_dal: '2027-01-01' }),
    ];
    expect(tariffaAllaData(righe, '2026-08-01')?.id).toBe('nuova');
    expect(tariffaAllaData(righe, '2026-02-01')?.id).toBe('vecchia');
    expect(tariffaAllaData(righe, '2027-06-01')?.id).toBe('futura');
  });

  it('rispetta valido_al e il flag attivo', () => {
    expect(tariffaAllaData([riga({ valido_al: '2026-06-30' })], '2026-08-01')).toBeNull();
    expect(tariffaAllaData([riga({ attivo: false })], '2026-08-01')).toBeNull();
  });

  it('nessuna riga applicabile → null', () => {
    expect(tariffaAllaData([], '2026-08-01')).toBeNull();
    expect(tariffaAllaData([riga({ valido_dal: '2027-01-01' })], '2026-08-01')).toBeNull();
  });
});

describe('territoriDelCommittente', () => {
  it('unisce i territori dei contratti attivi, deduplicando per nome', () => {
    const c = committente({
      contratti: [
        contratto({ id: 'k1', nome: 'A', territori: [terr({ id: 't1', nome: 'Terracina' })] }),
        contratto({ id: 'k2', nome: 'B', territori: [terr({ id: 't2', nome: 'terracina' }), terr({ id: 't3', nome: 'Fondi' })] }),
      ],
    });
    expect(territoriDelCommittente(c).map((t) => t.nome)).toEqual(['Fondi', 'Terracina']);
  });

  it('ignora i contratti sospesi e i territori disattivati', () => {
    const c = committente({
      contratti: [
        contratto({ id: 'k1', attivo: false, territori: [terr({ id: 't1', nome: 'Sospeso' })] }),
        contratto({ id: 'k2', territori: [terr({ id: 't2', nome: 'Spento', attivo: false }), terr({ id: 't3', nome: 'Vivo' })] }),
      ],
    });
    expect(territoriDelCommittente(c).map((t) => t.nome)).toEqual(['Vivo']);
  });

  it('committente assente o senza contratti → lista vuota', () => {
    expect(territoriDelCommittente(null)).toEqual([]);
    expect(territoriDelCommittente(committente())).toEqual([]);
  });
});
