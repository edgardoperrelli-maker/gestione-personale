import { describe, it, expect } from 'vitest';
import {
  chiaveTassonomia, buildTassonomiaIndex, committenteEquivalente, risolviGruppo,
  type TassonomiaRiga,
} from './tassonomia';
import { ALIAS_ATTIVITA } from './aliasAttivita';

const riga = (over: Partial<TassonomiaRiga> = {}): TassonomiaRiga => ({
  committente: 'acea',
  descrizione: 'Limitazione Massiva su Impianto',
  descrizioneNorm: 'LIMITAZIONE MASSIVA SU IMPIANTO',
  gruppo: 'LIMITAZIONI MASSIVE',
  attivo: true,
  ...over,
});

describe('chiaveTassonomia', () => {
  it('maiuscolo, spazi collassati, senza accenti (stessa chiave del listino)', () => {
    expect(chiaveTassonomia('  Rimozione   misuratore per morosità ')).toBe('RIMOZIONE MISURATORE PER MOROSITA');
  });
  it('vuoto/null → stringa vuota', () => {
    expect(chiaveTassonomia('')).toBe('');
    expect(chiaveTassonomia(null)).toBe('');
  });
});

describe('committenteEquivalente', () => {
  it('lim_massive equivale ad acea', () => {
    expect(committenteEquivalente('lim_massive')).toBe('acea');
  });
  it('normalizza il case', () => {
    expect(committenteEquivalente('ITALGAS')).toBe('italgas');
  });
});

describe('risolviGruppo', () => {
  const index = buildTassonomiaIndex([
    riga(),
    riga({ committente: 'acea', descrizione: 'Regolarizzazione flusso idrico', descrizioneNorm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'DUNNING' }),
    riga({ committente: 'italgas', descrizione: 'Regolarizzazione flusso idrico', descrizioneNorm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'BONIFICHE EXTRA' }),
    riga({ committente: 'italgas', descrizione: 'BONIFICHE', descrizioneNorm: 'BONIFICHE', gruppo: 'BONIFICHE' }),
    riga({ committente: 'italgas', descrizione: 'S-PR-003 A Sonda', descrizioneNorm: 'S-PR-003 A SONDA', gruppo: "ATTIVITA' ALLA CLIENTELA" }),
    riga({ committente: 'acea', descrizione: 'RESINE', descrizioneNorm: 'RESINE', gruppo: 'DUNNING', attivo: false }),
  ]);

  it('match case/spazi-insensitive → riga canonica', () => {
    const r = risolviGruppo('acea', ' limitazione massiva SU impianto ', index);
    expect(r?.gruppo).toBe('LIMITAZIONI MASSIVE');
    expect(r?.descrizione).toBe('Limitazione Massiva su Impianto');
  });
  it('ambiguità risolta per committente', () => {
    expect(risolviGruppo('acea', 'Regolarizzazione flusso idrico', index)?.gruppo).toBe('DUNNING');
    expect(risolviGruppo('italgas', 'Regolarizzazione flusso idrico', index)?.gruppo).toBe('BONIFICHE EXTRA');
  });
  it('lim_massive usa la tassonomia acea', () => {
    expect(risolviGruppo('lim_massive', 'LIMITAZIONI MASSIVE', buildTassonomiaIndex([riga({ descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE' })]))?.gruppo).toBe('LIMITAZIONI MASSIVE');
  });
  it("committente 'altro': prova acea poi italgas", () => {
    expect(risolviGruppo('altro', 'BONIFICHE', index)?.gruppo).toBe('BONIFICHE');
    expect(risolviGruppo('altro', 'Limitazione Massiva su Impianto', index)?.gruppo).toBe('LIMITAZIONI MASSIVE');
  });
  it('descrizione sconosciuta o vuota → null', () => {
    expect(risolviGruppo('acea', 'ATTIVITA INVENTATA', index)).toBeNull();
    expect(risolviGruppo('acea', '', index)).toBeNull();
    expect(risolviGruppo('acea', null, index)).toBeNull();
  });
  it('le righe non attive sono escluse', () => {
    expect(risolviGruppo('acea', 'RESINE', index)).toBeNull();
  });
});

describe('risolviGruppo + alias attività (opt-in, solo lettura modulo)', () => {
  // Fixture = i 6 canonici del seed reale (20260720150000) coi loro gruppi.
  const AC = "ATTIVITA' ALLA CLIENTELA";
  const canonici: Array<{ committente: string; descrizione: string; gruppo: string }> = [
    { committente: 'acea', descrizione: 'LIMITAZIONI MASSIVE', gruppo: 'LIMITAZIONI MASSIVE' },
    { committente: 'italgas', descrizione: "UT MOROSITA' PRIMO PASSAGGIO", gruppo: AC },
    // Codici italgas: la canonica è il codice NUDO (migration 20260722190000).
    { committente: 'italgas', descrizione: 'DIS00N', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-AI-022', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-MR-002', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-MR-003', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-001', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-003', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-004', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-007', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-009', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-019', gruppo: AC },
    { committente: 'italgas', descrizione: 'S-PR-077', gruppo: AC },
  ];
  const index = buildTassonomiaIndex(canonici.map((c) => riga({ ...c, descrizioneNorm: chiaveTassonomia(c.descrizione) })));
  const gruppoDiCanonica = new Map(canonici.map((c) => [`${c.committente}|${chiaveTassonomia(c.descrizione)}`, c.gruppo]));

  it('senza opts: nessun alias (comportamento write-path invariato)', () => {
    expect(risolviGruppo('acea', 'LIMITAZIONE MASSIVA', index)).toBeNull(); // variante non è literal di tassonomia
    expect(risolviGruppo('acea', 'LIMITAZIONI MASSIVE', index)?.gruppo).toBe('LIMITAZIONI MASSIVE'); // canonico sì
  });

  it('INVARIANTE: ogni alias risolve (allinea) alla canonica e allo STESSO gruppo', () => {
    for (const [chiave, canonica] of Object.entries(ALIAS_ATTIVITA)) {
      const sep = chiave.indexOf('|');
      const committente = chiave.slice(0, sep);
      const variante = chiave.slice(sep + 1);
      const r = risolviGruppo(committente, variante, index, { allinea: 'lettura' });
      expect(chiaveTassonomia(r?.descrizione)).toBe(canonica); // la canonica è un literal di tassonomia
      expect(r?.gruppo).toBe(gruppoDiCanonica.get(`${committente}|${canonica}`)); // stesso gruppo
    }
  });

  it('typo acea → LIMITAZIONI MASSIVE (case/spazi-insensitive)', () => {
    for (const v of ['LIMITAZIONE MASSIVA', 'LIMITAZIONI MASSICE', 'limitazioni massice']) {
      expect(risolviGruppo('acea', v, index, { allinea: 'lettura' })?.descrizione).toBe('LIMITAZIONI MASSIVE');
    }
  });
  it('lim_massive eredita l’alias acea', () => {
    expect(risolviGruppo('lim_massive', 'LIMITAZIONE MASSIVA', index, { allinea: 'lettura' })?.descrizione).toBe('LIMITAZIONI MASSIVE');
  });
  it("committente 'altro' applica l’alias sul fallback", () => {
    expect(risolviGruppo('altro', 'DIS00N', index, { allinea: 'lettura' })?.gruppo).toBe(AC);
  });
  it('scrittura: massive collassa; ATLAS collassa SOLO in lettura (storage = dettaglio)', () => {
    expect(risolviGruppo('acea', 'LIMITAZIONE MASSIVA', index, { allinea: 'scrittura' })?.descrizione).toBe('LIMITAZIONI MASSIVE');
    // Le varianti ATLAS collassano al codice nudo in LETTURA (display/dedup); lo storage
    // conserva il dettaglio, quindi in scrittura NON collassano.
    expect(risolviGruppo('italgas', 'S-PR-003 A', index, { allinea: 'lettura' })?.descrizione).toBe('S-PR-003');
    expect(risolviGruppo('italgas', 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO', index, { allinea: 'lettura' })?.descrizione).toBe('DIS00N');
  });
});
