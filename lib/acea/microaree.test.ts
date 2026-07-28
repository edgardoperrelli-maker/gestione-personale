import { describe, it, expect } from 'vitest';
import {
  LATO_LAT, LATO_LNG, RIQUADRO_LAZIO, assegnaGruppi, cella, dentroLazio, type PuntoOrdine,
} from './microaree';

const ROMA_CENTRO = { lat: 41.8933, lng: 12.4829 };

const punto = (chiave: string, comune: string | null, coord: { lat: number; lng: number } | null): PuntoOrdine =>
  ({ chiave, comune, coord });

describe('dentroLazio', () => {
  it('accetta i punti della commessa', () => {
    expect(dentroLazio(ROMA_CENTRO)).toBe(true);
    expect(dentroLazio({ lat: 41.9631, lng: 12.7969 })).toBe(true); // Tivoli
    expect(dentroLazio({ lat: 41.4584, lng: 12.9037 })).toBe(true); // Latina
    expect(dentroLazio({ lat: 42.4168, lng: 12.1057 })).toBe(true); // Viterbo
  });

  // La patologia tipica di questi provider: su un indirizzo ambiguo rispondono con l'omonimo di
  // un'altra regione — «VIA ROMA 1» esiste ovunque. Un punto a Milano non produce un gruppo
  // sbagliato, ne produce uno INVENTATO, che manderebbe una squadra a fare un giro inesistente.
  it.each([
    ['Milano', { lat: 45.4642, lng: 9.19 }],
    ['Napoli', { lat: 40.8518, lng: 14.2681 }],
    ['Palermo', { lat: 38.1157, lng: 13.3615 }],
    ['centro dell’Italia geodetico (0,0 di un parsing andato male)', { lat: 0, lng: 0 }],
  ])('rifiuta %s', (_dove, c) => {
    expect(dentroLazio(c)).toBe(false);
  });

  it('rifiuta i non-numeri invece di farli passare come cella', () => {
    expect(dentroLazio({ lat: Number.NaN, lng: 12.5 })).toBe(false);
    expect(dentroLazio({ lat: 41.9, lng: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('il riquadro copre il Lazio senza sconfinare nelle regioni vicine', () => {
    expect(RIQUADRO_LAZIO.latMax).toBeLessThan(43.5); // sotto la Toscana interna
    expect(RIQUADRO_LAZIO.lngMax).toBeLessThan(14.5); // a ovest della Campania
  });
});

describe('cella', () => {
  it('due punti a poche decine di metri cadono nella stessa cella', () => {
    const a = ROMA_CENTRO;
    const b = { lat: ROMA_CENTRO.lat + 0.0003, lng: ROMA_CENTRO.lng + 0.0003 };
    expect(cella(a)).toEqual(cella(b));
  });

  it('due punti a qualche chilometro cadono in celle diverse', () => {
    const lontano = { lat: ROMA_CENTRO.lat + LATO_LAT * 3, lng: ROMA_CENTRO.lng + LATO_LNG * 3 };
    expect(cella(lontano)).not.toEqual(cella(ROMA_CENTRO));
  });

  // Il motivo per cui i due lati sono diversi: un grado di longitudine a 42° vale ~82,6 km contro
  // i ~111 di uno di latitudine. Lati uguali darebbero celle rettangolari sul terreno.
  it('la cella è quadrata sul terreno, non sulla carta', () => {
    const kmLat = LATO_LAT * 111;
    const kmLng = LATO_LNG * 82.6;
    expect(Math.abs(kmLat - kmLng)).toBeLessThan(0.3);
  });

  it('è deterministica: stessa coordinata, stessa cella', () => {
    expect(cella(ROMA_CENTRO)).toEqual(cella({ ...ROMA_CENTRO }));
  });
});

describe('assegnaGruppi', () => {
  it('mette nello stesso gruppo i punti vicini dello stesso comune', () => {
    const g = assegnaGruppi([
      punto('a', 'ROMA', ROMA_CENTRO),
      punto('b', 'ROMA', { lat: ROMA_CENTRO.lat + 0.0005, lng: ROMA_CENTRO.lng + 0.0005 }),
    ]);
    expect(g.totale).toBe(1);
    expect(g.perRiga.get('a')).toBe(g.perRiga.get('b'));
  });

  // Due punti a un chilometro ma in comuni diversi sono due giri diversi: cambiano referente,
  // permessi e a volte il territorio assegnato.
  it('non mette mai insieme comuni diversi, per quanto vicini', () => {
    const g = assegnaGruppi([
      punto('a', 'ROMA', ROMA_CENTRO),
      punto('b', 'CIAMPINO', { lat: ROMA_CENTRO.lat + 0.0005, lng: ROMA_CENTRO.lng + 0.0005 }),
    ]);
    expect(g.totale).toBe(2);
    expect(g.perRiga.get('a')).not.toBe(g.perRiga.get('b'));
  });

  it('separa i punti lontani dello stesso comune', () => {
    const g = assegnaGruppi([
      punto('a', 'ROMA', ROMA_CENTRO),
      punto('b', 'ROMA', { lat: ROMA_CENTRO.lat + LATO_LAT * 5, lng: ROMA_CENTRO.lng }),
    ]);
    expect(g.totale).toBe(2);
  });

  it('una coordinata fuori dal Lazio non fa gruppo: è un errore, non una zona', () => {
    const g = assegnaGruppi([
      punto('a', 'ROMA', ROMA_CENTRO),
      punto('milano', 'ROMA', { lat: 45.4642, lng: 9.19 }),
    ]);
    expect(g.totale).toBe(1);
    expect(g.perRiga.has('milano')).toBe(false);
    expect(g.senzaGruppo).toBe(1);
  });

  it('le righe non ancora geocodificate restano senza gruppo, contate', () => {
    const g = assegnaGruppi([punto('a', 'ROMA', ROMA_CENTRO), punto('b', 'ROMA', null)]);
    expect(g.perRiga.has('b')).toBe(false);
    expect(g.senzaGruppo).toBe(1);
  });

  it('numera da 1 senza salti', () => {
    const g = assegnaGruppi([
      punto('a', 'ROMA', ROMA_CENTRO),
      punto('b', 'TIVOLI', { lat: 41.9631, lng: 12.7969 }),
      punto('c', 'LATINA', { lat: 41.4584, lng: 12.9037 }),
    ]);
    expect([...g.perRiga.values()].sort()).toEqual([1, 2, 3]);
  });

  // Un elenco ordinato per gruppo deve leggersi come un giro, non come una lista casuale.
  it('numera in ordine geografico: comune, poi da nord a sud', () => {
    const g = assegnaGruppi([
      punto('sud', 'ROMA', { lat: 41.80, lng: 12.48 }),
      punto('nord', 'ROMA', { lat: 41.95, lng: 12.48 }),
    ]);
    expect(g.perRiga.get('nord')).toBeLessThan(g.perRiga.get('sud')!);
  });

  it('i comuni si susseguono in ordine alfabetico', () => {
    const g = assegnaGruppi([
      punto('t', 'TIVOLI', { lat: 41.9631, lng: 12.7969 }),
      punto('c', 'CIAMPINO', { lat: 41.8000, lng: 12.6000 }),
    ]);
    expect(g.perRiga.get('c')).toBeLessThan(g.perRiga.get('t')!);
  });

  // La ragione per cui si è scelta una griglia invece di un clustering a distanza: i confini non
  // si spostano quando il registro cambia, quindi «fai il 12» vuol dire la stessa cosa domani.
  it('è deterministica: stesso insieme, stessi numeri, comunque sia ordinato in ingresso', () => {
    const p = [
      punto('a', 'ROMA', ROMA_CENTRO),
      punto('b', 'TIVOLI', { lat: 41.9631, lng: 12.7969 }),
      punto('c', 'ROMA', { lat: ROMA_CENTRO.lat + LATO_LAT * 4, lng: ROMA_CENTRO.lng }),
    ];
    const dritto = assegnaGruppi(p);
    const rovescio = assegnaGruppi([...p].reverse());
    for (const k of ['a', 'b', 'c']) {
      expect(rovescio.perRiga.get(k)).toBe(dritto.perRiga.get(k));
    }
  });

  it('senza punti non inventa gruppi', () => {
    expect(assegnaGruppi([])).toEqual({ perRiga: new Map(), totale: 0, senzaGruppo: 0 });
  });
});
