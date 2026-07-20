import { describe, it, expect } from 'vitest';
import {
  chiaveTassonomia, buildTassonomiaIndex, committenteEquivalente, risolviGruppo,
  type TassonomiaRiga,
} from './tassonomia';

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
