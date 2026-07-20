import { describe, expect, it } from 'vitest';
import {
  COMMITTENTI_FLUSSO,
  buildAlberoFlussi,
  normalizzaCollegamento,
  templateCollegato,
  type TemplateFlussoRow,
} from './flussiGruppo';

type Tpl = TemplateFlussoRow & { nome: string };

const tpl = (id: string, over: Partial<Tpl> = {}): Tpl => ({ id, nome: id, ...over });

const TASSONOMIA = [
  { committente: 'acea', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
  { committente: 'acea', gruppo: 'DUNNING', attivo: true },
  { committente: 'acea', gruppo: 'Dunning', attivo: true }, // doppione: stessa chiave normalizzata
  { committente: 'acea', gruppo: 'GRUPPO DISMESSO', attivo: false },
  { committente: 'italgas', gruppo: "ATTIVITA' ALLA CLIENTELA", attivo: true },
  { committente: 'italgas', gruppo: 'P.I.', attivo: true },
];

function nodo(albero: ReturnType<typeof buildAlberoFlussi<Tpl>>, committente: string) {
  const n = albero.committenti.find((c) => c.committente === committente);
  if (!n) throw new Error(`committente ${committente} assente`);
  return n;
}

describe('buildAlberoFlussi', () => {
  it('committenti fissi nell\'ordine del flowchart (italgas, acea, acqualatina)', () => {
    const albero = buildAlberoFlussi(TASSONOMIA, []);
    expect(albero.committenti.map((c) => c.committente)).toEqual([...COMMITTENTI_FLUSSO]);
    expect(albero.committenti.map((c) => c.committente)).toEqual(['italgas', 'acea', 'acqualatina']);
  });

  it('gruppi dalla tassonomia: solo attivi, dedup per chiave normalizzata', () => {
    const albero = buildAlberoFlussi(TASSONOMIA, []);
    const gruppi = nodo(albero, 'acea').gruppi.map((g) => g.gruppo);
    expect(gruppi).toContain('LIMITAZIONI MASSIVE');
    expect(gruppi.filter((g) => g.toUpperCase() === 'DUNNING')).toHaveLength(1);
    expect(gruppi).not.toContain('GRUPPO DISMESSO');
  });

  it('acqualatina ha la foglia extra SOSTITUZIONE MISURATORI anche senza tassonomia', () => {
    const albero = buildAlberoFlussi(TASSONOMIA, []);
    expect(nodo(albero, 'acqualatina').gruppi.map((g) => g.gruppo)).toEqual(['SOSTITUZIONE MISURATORI']);
  });

  it('un flusso collegato compare sotto il suo gruppo (match normalizzato)', () => {
    const massive = tpl('massive', { gruppo_committente: 'acea', gruppi_attivita: ['limitazioni  massive'] });
    const albero = buildAlberoFlussi(TASSONOMIA, [massive]);
    const gruppo = nodo(albero, 'acea').gruppi.find((g) => g.gruppo === 'LIMITAZIONI MASSIVE');
    expect(gruppo?.flussi.map((t) => t.id)).toEqual(['massive']);
    expect(albero.nonCollegati).toHaveLength(0);
  });

  it('un flusso multi-gruppo (ibrido) compare sotto tutti i suoi gruppi', () => {
    const ibrido = tpl('ibrido', { gruppo_committente: 'acea', gruppi_attivita: ['LIMITAZIONI MASSIVE', 'DUNNING'] });
    const albero = buildAlberoFlussi(TASSONOMIA, [ibrido]);
    const acea = nodo(albero, 'acea');
    const sotto = acea.gruppi.filter((g) => g.flussi.some((t) => t.id === 'ibrido')).map((g) => g.gruppo);
    expect(sotto).toHaveLength(2);
  });

  it('un gruppo referenziato da un flusso ma assente dalla tassonomia resta visibile', () => {
    const orfano = tpl('orfano', { gruppo_committente: 'italgas', gruppi_attivita: ['GRUPPO RIMOSSO'] });
    const albero = buildAlberoFlussi(TASSONOMIA, [orfano]);
    const gruppo = nodo(albero, 'italgas').gruppi.find((g) => g.gruppo === 'GRUPPO RIMOSSO');
    expect(gruppo?.flussi.map((t) => t.id)).toEqual(['orfano']);
  });

  it('manuali per committente con equivalenza lim_massive→acea, esclusi dai non collegati', () => {
    const manuale = tpl('man-lim', { solo_manuale: true, committente: 'lim_massive' });
    const albero = buildAlberoFlussi(TASSONOMIA, [manuale]);
    expect(nodo(albero, 'acea').manuali.map((t) => t.id)).toEqual(['man-lim']);
    expect(nodo(albero, 'italgas').manuali).toHaveLength(0);
    expect(albero.nonCollegati).toHaveLength(0);
  });

  it('un manuale COLLEGATO a un gruppo vive nel gruppo, non nella sezione manuali', () => {
    const pi = tpl('pi', { solo_manuale: true, committente: null, gruppo_committente: 'italgas', gruppi_attivita: ['P.I.'] });
    const albero = buildAlberoFlussi(TASSONOMIA, [pi]);
    const gruppo = nodo(albero, 'italgas').gruppi.find((g) => g.gruppo === 'P.I.');
    expect(gruppo?.flussi.map((t) => t.id)).toEqual(['pi']);
    expect(nodo(albero, 'italgas').manuali).toHaveLength(0);
  });

  it('un classico senza collegamento va nei non collegati (manuale senza committente noto incluso)', () => {
    const libero = tpl('libero');
    const manSenza = tpl('man-senza', { solo_manuale: true, committente: null });
    const albero = buildAlberoFlussi(TASSONOMIA, [libero, manSenza]);
    expect(albero.nonCollegati.map((t) => t.id).sort()).toEqual(['libero', 'man-senza']);
  });
});

describe('templateCollegato', () => {
  it('collegato solo con committente e almeno un gruppo', () => {
    expect(templateCollegato(tpl('a', { gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'] }))).toBe(true);
    expect(templateCollegato(tpl('b', { gruppo_committente: 'acea', gruppi_attivita: [] }))).toBe(false);
    expect(templateCollegato(tpl('c', { gruppi_attivita: ['DUNNING'] }))).toBe(false);
    expect(templateCollegato(tpl('d'))).toBe(false);
  });
});

describe('normalizzaCollegamento', () => {
  it('dedup normalizzato e trim dei gruppi', () => {
    expect(
      normalizzaCollegamento({ gruppo_committente: 'acea', gruppi_attivita: [' DUNNING ', 'dunning', '', 'LIMITAZIONI  MASSIVE'] }),
    ).toEqual({ gruppo_committente: 'acea', gruppi_attivita: ['DUNNING', 'LIMITAZIONI MASSIVE'] });
  });

  it('coppia incompleta → entrambi null (scollegato)', () => {
    expect(normalizzaCollegamento({ gruppo_committente: 'acea', gruppi_attivita: [] }))
      .toEqual({ gruppo_committente: null, gruppi_attivita: null });
    expect(normalizzaCollegamento({ gruppo_committente: null, gruppi_attivita: ['DUNNING'] }))
      .toEqual({ gruppo_committente: null, gruppi_attivita: null });
    expect(normalizzaCollegamento({})).toEqual({ gruppo_committente: null, gruppi_attivita: null });
  });
});
