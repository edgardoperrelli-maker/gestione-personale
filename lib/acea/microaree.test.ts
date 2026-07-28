import { describe, it, expect } from 'vitest';
import {
  LATO_LAT, LATO_LNG, RIQUADRO_LAZIO, assegnaGruppi, cella, dentroLazio, ereditaGruppi,
  type PuntoOrdine,
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

describe('ereditaGruppi', () => {
  const orfano = (chiave: string, comune: string | null, cap: string | null) => ({ chiave, comune, cap });

  // A Roma il comune non dice niente: 1.285 km², un solo gruppo manderebbe la stessa squadra
  // dall'Eur a Prima Porta. Il CAP è l'unico appiglio più fine che ACEA ci dà.
  it('a Roma presta per CAP', () => {
    const g = ereditaGruppi(
      [orfano('nuovo', 'ROMA', '00139')],
      [
        { comune: 'ROMA', cap: '00139', gruppo: 7 },
        { comune: 'ROMA', cap: '00185', gruppo: 99 },
      ],
    );
    expect(g.get('nuovo')).toBe(7);
  });

  // Fuori Roma i comuni stanno dentro un giro, e un CAP ne copre spesso più d'uno: prestare per
  // comune è insieme più semplice e più preciso.
  it('fuori Roma presta per comune, ignorando il CAP', () => {
    const g = ereditaGruppi(
      [orfano('nuovo', 'TIVOLI', '99999')],
      [
        { comune: 'TIVOLI', cap: '00019', gruppo: 12 },
        { comune: 'ZAGAROLO', cap: '00039', gruppo: 40 },
      ],
    );
    expect(g.get('nuovo')).toBe(12);
  });

  it('vince il gruppo con più righe: la zona dove quel CAP si concentra davvero', () => {
    const g = ereditaGruppi(
      [orfano('nuovo', 'ROMA', '00139')],
      [
        { comune: 'ROMA', cap: '00139', gruppo: 5 },
        { comune: 'ROMA', cap: '00139', gruppo: 8 },
        { comune: 'ROMA', cap: '00139', gruppo: 8 },
      ],
    );
    expect(g.get('nuovo')).toBe(8);
  });

  it('a parità vince il numero più basso, non l’ordine di arrivo', () => {
    const donatori = [
      { comune: 'TIVOLI', cap: '00019', gruppo: 30 },
      { comune: 'TIVOLI', cap: '00019', gruppo: 11 },
    ];
    expect(ereditaGruppi([orfano('a', 'TIVOLI', null)], donatori).get('a')).toBe(11);
    expect(ereditaGruppi([orfano('a', 'TIVOLI', null)], [...donatori].reverse()).get('a')).toBe(11);
  });

  // Meglio «—» che un numero inventato: un gruppo preso da un insieme vuoto manderebbe una squadra
  // in un posto scelto a caso.
  it('senza donatori non presta niente', () => {
    expect(ereditaGruppi([orfano('nuovo', 'FRASCATI', '00044')], []).has('nuovo')).toBe(false);
    expect(
      ereditaGruppi([orfano('nuovo', 'ROMA', '00139')], [{ comune: 'ROMA', cap: '00185', gruppo: 3 }])
        .has('nuovo'),
    ).toBe(false);
  });

  it('un CAP mancante a Roma non pesca dal mucchio', () => {
    // Senza CAP, a Roma, non c'è una zona: prestare un gruppo qualsiasi della città sarebbe peggio
    // che non prestarne nessuno.
    const g = ereditaGruppi(
      [orfano('nuovo', 'ROMA', null)],
      [{ comune: 'ROMA', cap: '00139', gruppo: 7 }],
    );
    expect(g.has('nuovo')).toBe(false);
  });

  it('non si fa confondere da maiuscole e spazi', () => {
    const g = ereditaGruppi(
      [orfano('a', '  tivoli ', null), orfano('b', 'roma', '00139')],
      [
        { comune: 'TIVOLI', cap: '00019', gruppo: 12 },
        { comune: 'ROMA', cap: '00139', gruppo: 7 },
      ],
    );
    expect(g.get('a')).toBe(12);
    expect(g.get('b')).toBe(7);
  });

  it('presta a tutti gli orfani della stessa zona lo stesso numero', () => {
    const g = ereditaGruppi(
      [orfano('a', 'ROMA', '00139'), orfano('b', 'ROMA', '00139')],
      [{ comune: 'ROMA', cap: '00139', gruppo: 7 }],
    );
    expect(g.get('a')).toBe(7);
    expect(g.get('b')).toBe(7);
  });
});
