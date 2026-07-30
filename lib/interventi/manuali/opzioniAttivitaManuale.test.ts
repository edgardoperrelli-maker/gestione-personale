import { describe, it, expect } from 'vitest';
import {
  gruppiAttivitaManuale,
  gruppoDellAttivita,
  opzioniAttivitaManuale,
  opzioniDelGruppo,
} from './opzioniAttivitaManuale';
import { chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const riga = (committente: string, descrizione: string, gruppo: string, attivo = true): TassonomiaRiga => ({
  committente,
  descrizione,
  descrizioneNorm: chiaveTassonomia(descrizione),
  gruppo,
  attivo,
});

const TASSONOMIA: TassonomiaRiga[] = [
  riga('italgas', 'S-PR-003 A', "ATTIVITA' ALLA CLIENTELA"),
  riga('italgas', 'BONIFICHE EXTRA', 'BONIFICHE EXTRA'),
  riga('italgas', 'Regolarizzazione flusso idrico', 'BONIFICHE EXTRA'),
  riga('italgas', 'VECCHIA ATTIVITA', "ATTIVITA' ALLA CLIENTELA", false), // non attiva
  riga('acea', 'Sospensione fornitura', 'DUNNING'),
  riga('acea', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE'),
];

const descrizioni = (righe: TassonomiaRiga[]) => righe.map((r) => r.descrizione).sort();

describe('opzioniAttivitaManuale', () => {
  it('soloBonificheExtra → SOLO la "BONIFICHE EXTRA" Italgas (non l\'intera lista, non gli altri gruppi)', () => {
    const out = opzioniAttivitaManuale(TASSONOMIA, 'italgas', { soloBonificheExtra: true });
    expect(descrizioni(out)).toEqual(['BONIFICHE EXTRA']);
  });

  it('soloBonificheExtra ignora il committente scelto (il server forza comunque Italgas)', () => {
    // Stessa lista anche partendo da 'acea' / null: la regola è indipendente dal committente.
    expect(descrizioni(opzioniAttivitaManuale(TASSONOMIA, 'acea', { soloBonificheExtra: true }))).toEqual(['BONIFICHE EXTRA']);
    expect(descrizioni(opzioniAttivitaManuale(TASSONOMIA, null, { soloBonificheExtra: true }))).toEqual(['BONIFICHE EXTRA']);
  });

  it('italgas (flusso normale) → tutte le attive del committente, non solo BONIFICHE EXTRA', () => {
    const out = opzioniAttivitaManuale(TASSONOMIA, 'italgas');
    expect(descrizioni(out)).toEqual(['BONIFICHE EXTRA', 'Regolarizzazione flusso idrico', 'S-PR-003 A']);
  });

  it('lim_massive → equivalente acea', () => {
    const out = opzioniAttivitaManuale(TASSONOMIA, 'lim_massive');
    expect(descrizioni(out)).toEqual(['LIMITAZIONI MASSIVE', 'Sospensione fornitura']);
  });

  it('altro → tutte le attive (nessuna riga propria)', () => {
    const out = opzioniAttivitaManuale(TASSONOMIA, 'altro');
    expect(out).toHaveLength(5); // le 6 righe meno la non attiva
    expect(out.every((r) => r.attivo)).toBe(true);
  });

  it('committente assente → nessuna opzione', () => {
    expect(opzioniAttivitaManuale(TASSONOMIA, null)).toEqual([]);
    expect(opzioniAttivitaManuale(TASSONOMIA, '')).toEqual([]);
  });

  it('esclude sempre le righe non attive (anche in BONIFICHE EXTRA)', () => {
    const conBonificaNonAttiva = [...TASSONOMIA, riga('italgas', 'BONIFICHE EXTRA', 'BONIFICHE EXTRA', false)];
    // resta una sola riga (quella attiva); la non attiva non raddoppia l'opzione
    expect(opzioniAttivitaManuale(conBonificaNonAttiva, 'italgas', { soloBonificheExtra: true })).toHaveLength(1);
  });

  it('tassonomia mancante → lista vuota, nessun errore', () => {
    expect(opzioniAttivitaManuale(undefined, 'italgas')).toEqual([]);
    expect(opzioniAttivitaManuale(undefined, 'italgas', { soloBonificheExtra: true })).toEqual([]);
  });
});

// ── Cascata gruppo → dettaglio ───────────────────────────────────────────────

describe('gruppiAttivitaManuale', () => {
  it('gruppi distinti delle opzioni, ordinati per nome', () => {
    const out = gruppiAttivitaManuale(opzioniAttivitaManuale(TASSONOMIA, 'italgas'));
    expect(out).toEqual(["ATTIVITA' ALLA CLIENTELA", 'BONIFICHE EXTRA']);
  });

  it("deduplica per forma normalizzata (maiuscole/spazi non raddoppiano l'opzione)", () => {
    const righe = [
      riga('acea', 'Sospensione fornitura', 'DUNNING'),
      riga('acea', 'Regolarizzazione', 'Dunning'), // stessa chiave normalizzata
    ];
    expect(gruppiAttivitaManuale(righe)).toEqual(['DUNNING']);
  });

  it('lista vuota → nessun gruppo, nessun errore', () => {
    expect(gruppiAttivitaManuale([])).toEqual([]);
  });
});

describe('opzioniDelGruppo', () => {
  const opzioni = opzioniAttivitaManuale(TASSONOMIA, 'italgas');

  it('solo le attività del gruppo scelto (confronto normalizzato)', () => {
    expect(descrizioni(opzioniDelGruppo(opzioni, 'bonifiche  extra')))
      .toEqual(['BONIFICHE EXTRA', 'Regolarizzazione flusso idrico']);
  });

  it('gruppo vuoto/null → nessuna opzione (il dettaglio resta disabilitato)', () => {
    expect(opzioniDelGruppo(opzioni, '')).toEqual([]);
    expect(opzioniDelGruppo(opzioni, null)).toEqual([]);
  });
});

describe('gruppoDellAttivita', () => {
  const opzioni = opzioniAttivitaManuale(TASSONOMIA, 'italgas');

  it("risale al gruppo dall'attività già valorizzata (inizializza la cascata)", () => {
    expect(gruppoDellAttivita(opzioni, 'Regolarizzazione flusso idrico')).toBe('BONIFICHE EXTRA');
    expect(gruppoDellAttivita(opzioni, ' s-pr-003 a ')).toBe("ATTIVITA' ALLA CLIENTELA");
  });

  it('attività fuori catalogo o vuota → null', () => {
    expect(gruppoDellAttivita(opzioni, 'QUALCOSA DI IGNOTO')).toBeNull();
    expect(gruppoDellAttivita(opzioni, '')).toBeNull();
    expect(gruppoDellAttivita(opzioni, null)).toBeNull();
  });
});
