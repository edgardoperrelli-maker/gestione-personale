import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Fake minimo di Supabase: regge la sola catena usata da `operatoriGiorno.ts`
  (`from(t).select(...).in(col, valori)` atteso). Le righe di `assignments` arrivano già nella
  forma che il join produce — il fake non sa fare join, e non è quello che questi test provano:
  qui si provano il filtro per attività della famiglia (DUNNING / LIMITAZIONI MASSIVE), il dedup,
  le sottrazioni delle assenze e il rifiuto fuori finestra.
*/
type Riga = Record<string, unknown>;
const tabelle: Record<string, Riga[]> = {};

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (t: string) => ({
      select: () => ({
        in: (col: string, valori: unknown[]) => Promise.resolve({
          data: (tabelle[t] ?? []).filter((r) => valori.includes(r[col])),
          error: null,
        }),
      }),
    }),
  },
}));

const {
  chiaveAssegnazione, controllaAssegnazioni, finestraProgrammabile, operatoriPerGiorno,
} = await import('./operatoriGiorno');

const GIOVEDI = '2026-07-30';
const VENERDI = '2026-07-31';
const SABATO = '2026-08-01';
const LUNEDI = '2026-08-03';

/** Chiave dei motivi, col default dunning: com'era prima che la famiglia entrasse nella chiave. */
const k = (data: string, staffId: string, famiglia: 'dunning' | 'massive' = 'dunning') =>
  chiaveAssegnazione({ data, staffId, famiglia });

/** Attività di tabellone: il dunning, le massive e le altre. Nomi come in produzione. */
const ATT = {
  dunning: 'act-dunning',
  massive: 'act-massive',
  clientela: 'act-clientela',
  risanamento: 'act-risanamento',
  ferie: 'act-ferie',
};

/**
 * Riga di tabellone. Il DEFAULT fa dunning (attività singola): è il caso della squadra ACEA,
 * e tiene corti i test che provano altro.
 */
const assegna = (day_id: string, id: string, nome: string, extra: Riga = {}): Riga => ({
  day_id,
  staff_id: id,
  activity_id: ATT.dunning,
  activity_ids: [ATT.dunning],
  staff: { id, display_name: nome },
  territory: null,
  activity: { name: 'DUNNING' },
  ...extra,
});

beforeEach(() => {
  tabelle.calendar_days = [
    { id: 'g1', day: GIOVEDI },
    { id: 'g2', day: VENERDI },
    { id: 'g3', day: LUNEDI },
    { id: 'g4', day: SABATO },
  ];
  tabelle.assignments = [];
  tabelle.disponibilita_operatore = [];
  tabelle.activities = [
    { id: ATT.dunning, name: 'DUNNING' },
    { id: ATT.massive, name: 'LIMITAZIONI MASSIVE' },
    { id: ATT.clientela, name: 'CLIENTELA' },
    { id: ATT.risanamento, name: 'RISANAMENTO COLONNE' },
    { id: ATT.ferie, name: 'Ferie' },
  ];
});

describe('operatoriPerGiorno — solo chi fa DUNNING', () => {
  it('rende i nomi in tabellone col dunning, ordinati, con il territorio', () => {
    tabelle.assignments = [
      assegna('g1', 's2', 'PRATESI MARCO', { territory: { name: 'ACEA' } }),
      assegna('g1', 's1', 'CIARALLO ANNA', { territory: { name: 'ACEA' } }),
    ];
    return operatoriPerGiorno([GIOVEDI]).then((m) => {
      expect(m.get(GIOVEDI)).toEqual([
        { id: 's1', display_name: 'CIARALLO ANNA', territorio: 'ACEA' },
        { id: 's2', display_name: 'PRATESI MARCO', territorio: 'ACEA' },
      ]);
    });
  });

  it('chi è su un ALTRO territorio ma ha il dunning fra le attività multiple COMPARE', () => {
    // Il caso per cui il filtro è per ATTIVITÀ e non per territorio: Lazio Est su CLIENTELA,
    // col dunning aggiunto per saturare la giornata.
    tabelle.assignments = [
      assegna('g1', 's1', 'LIBERATORI ADRIANO', {
        territory: { name: 'LAZIO EST' },
        activity_id: ATT.clientela,
        activity: { name: 'CLIENTELA' },
        activity_ids: [ATT.clientela, ATT.dunning],
      }),
    ];
    return operatoriPerGiorno([GIOVEDI]).then((m) => {
      expect(m.get(GIOVEDI)).toEqual([
        { id: 's1', display_name: 'LIBERATORI ADRIANO', territorio: 'LAZIO EST' },
      ]);
    });
  });

  it('chi NON ha il dunning da nessuna parte non compare, qualunque territorio abbia', () => {
    tabelle.assignments = [
      assegna('g1', 's1', 'ARCANGELI DAVIDE', {
        territory: { name: 'NAPOLI' },
        activity_id: ATT.risanamento,
        activity: { name: 'RISANAMENTO COLONNE' },
        activity_ids: [ATT.risanamento],
      }),
      assegna('g1', 's2', 'FERRARA LUCA', {
        territory: { name: 'FIRENZE' },
        activity_id: ATT.clientela,
        activity: { name: 'CLIENTELA' },
        activity_ids: [ATT.clientela],
      }),
    ];
    return operatoriPerGiorno([GIOVEDI]).then((m) => {
      expect(m.get(GIOVEDI)).toEqual([]);
    });
  });

  it('una riga di tabellone senza NESSUNA attività non è dunning', () => {
    tabelle.assignments = [
      assegna('g1', 's1', 'GIOSI VITTORIO', {
        territory: { name: 'ACQUA LATINA' },
        activity_id: null,
        activity: null,
        activity_ids: [],
      }),
    ];
    return operatoriPerGiorno([GIOVEDI]).then((m) => {
      expect(m.get(GIOVEDI)).toEqual([]);
    });
  });

  it('una persona con più righe nello stesso giorno compare una volta sola', async () => {
    tabelle.assignments = [
      assegna('g1', 's1', 'CIARALLO ANNA'),
      assegna('g1', 's1', 'CIARALLO ANNA'),
    ];
    const m = await operatoriPerGiorno([GIOVEDI]);
    expect(m.get(GIOVEDI)).toHaveLength(1);
  });

  it('l’assenza INTERA toglie dall’elenco, quella PARZIALE no', async () => {
    tabelle.assignments = [assegna('g1', 's1', 'CIARALLO ANNA'), assegna('g1', 's2', 'PRATESI MARCO')];
    tabelle.disponibilita_operatore = [
      { staff_id: 's1', data: GIOVEDI, ora_da: null, ora_a: null },        // intera
      { staff_id: 's2', data: GIOVEDI, ora_da: '08:00', ora_a: '12:00' },  // mezza giornata
    ];
    const m = await operatoriPerGiorno([GIOVEDI]);
    // Chi c'è mezza giornata un ordine lo può fare: toglierlo significherebbe non poterglielo
    // assegnare affatto.
    expect(m.get(GIOVEDI)?.map((o) => o.id)).toEqual(['s2']);
  });

  it('un’assenza su un ALTRO giorno non toglie niente', async () => {
    tabelle.assignments = [assegna('g1', 's1', 'CIARALLO ANNA')];
    tabelle.disponibilita_operatore = [{ staff_id: 's1', data: VENERDI, ora_da: null, ora_a: null }];
    const m = await operatoriPerGiorno([GIOVEDI]);
    expect(m.get(GIOVEDI)?.map((o) => o.id)).toEqual(['s1']);
  });

  it('un giorno senza tabellone torna un elenco vuoto, non un buco', async () => {
    const m = await operatoriPerGiorno([GIOVEDI, VENERDI]);
    expect(m.get(GIOVEDI)).toEqual([]);
    expect(m.get(VENERDI)).toEqual([]);
  });
});

/*
  I giorni PRONTI sono due, ma la finestra è di due settimane: il giorno scelto in barra si chiede
  per nome, invece di leggere in anticipo un tabellone che quasi nessuno guarderà.
*/
describe('finestraProgrammabile', () => {
  it('di suo porta i due giorni pronti, col loro tabellone', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const giorni = await finestraProgrammabile(VENERDI);
    expect(giorni.map((g) => g.data)).toEqual([VENERDI, SABATO]);
    expect(giorni[0].operatori.map((o) => o.id)).toEqual(['s1']);
  });

  it('un giorno in più della finestra entra in ordine, col suo tabellone', async () => {
    tabelle.assignments = [assegna('g3', 's1', 'CIARALLO ANNA')];
    const giorni = await finestraProgrammabile(VENERDI, 'dunning', [LUNEDI]);
    expect(giorni.map((g) => g.data)).toEqual([VENERDI, SABATO, LUNEDI]);
    expect(giorni[2].etichetta).toBe('Lunedì');
    expect(giorni[2].operatori.map((o) => o.id)).toEqual(['s1']);
  });

  it('un giorno FUORI finestra non si fa nemmeno leggere', async () => {
    const giorni = await finestraProgrammabile(VENERDI, 'dunning', ['2026-09-15', '2026-08-02']);
    expect(giorni.map((g) => g.data)).toEqual([VENERDI, SABATO]);
  });
});

// Il controllo sta sul server e non solo nel menu: la griglia accetta un incolla da Excel, e una
// regola applicata alla sola UI si aggira con Ctrl+V.
describe('controllaAssegnazioni', () => {
  it('passa la coppia giusta: giorno in finestra, operatore col dunning in tabellone', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.size).toBe(0);
  });

  it('dal venerdì passano sia il sabato sia IL LUNEDÌ: la finestra è di due settimane (dec. 49)', async () => {
    tabelle.assignments = [assegna('g4', 's1', 'CIARALLO ANNA'), assegna('g3', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni(
      [{ data: SABATO, staffId: 's1', dataScritta: true }, { data: LUNEDI, staffId: 's1', dataScritta: true }],
      VENERDI,
    );
    expect(m.get(k(SABATO, 's1'))).toBeUndefined();
    expect(m.get(k(LUNEDI, 's1'))).toBeUndefined();
  });

  it('la domenica resta fuori: non si lavora', async () => {
    const m = await controllaAssegnazioni(
      [{ data: '2026-08-02', staffId: 's1', dataScritta: true }],
      VENERDI,
    );
    expect(m.get(k('2026-08-02', 's1'))).toMatch(/fuori finestra/);
  });

  it('rifiuta una data lontana dicendo fin dove arriva la finestra', async () => {
    const m = await controllaAssegnazioni([{ data: '2026-09-15', staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.get(k('2026-09-15', 's1'))).toBe(
      'martedì 15/09 è fuori finestra: si programma da venerdì 31/07 a venerdì 14/08, domenica esclusa',
    );
  });

  it('rifiuta chi in tabellone c’è ma SENZA dunning: il motivo dice l’attività, non il refuso', async () => {
    tabelle.assignments = [
      assegna('g2', 's1', 'CIARALLO ANNA'),
      assegna('g2', 's9', 'FERRARA LUCA', {
        activity_id: ATT.clientela, activity: { name: 'CLIENTELA' }, activity_ids: [ATT.clientela],
      }),
    ];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's9', dataScritta: true }], VENERDI);
    expect(m.get(k(VENERDI, 's9'))).toBe('operatore senza attività DUNNING in cronoprogramma per venerdì 31/07');
  });

  it('tabellone senza nessuno sul dunning: lo dice', async () => {
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.get(k(VENERDI, 's1'))).toBe(
      'nessun operatore con attività DUNNING in cronoprogramma per venerdì 31/07',
    );
  });

  it('chi è in tabellone ma in ferie intere quel giorno viene rifiutato', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    tabelle.disponibilita_operatore = [{ staff_id: 's1', data: VENERDI, ora_da: null, ora_a: null }];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.get(k(VENERDI, 's1'))).toMatch(/nessun operatore con attività DUNNING/);
  });

  /*
    La presa allentata: un lavoro rimasto indietro si deve poter riassegnare.

    Con `dataScritta: false` il giorno non lo si sta scegliendo, lo si eredita da un intervento che
    esiste già — e il cronoprogramma di un giorno passato non ha nessuna autorità su chi ci va
    adesso. Senza questa distinzione, cambiare l'esecutore di ieri era impossibile senza prima
    spostare la data, cioè senza cambiare anche quando.
  */
  describe('cambio del solo esecutore su un intervento vecchio', () => {
    it('una data fuori finestra passa, se non è quella che si sta scrivendo', async () => {
      const m = await controllaAssegnazioni(
        [{ data: '2026-07-20', staffId: 's9', dataScritta: false }],
        VENERDI,
      );
      expect(m.size).toBe(0);
    });

    it('la stessa data, se la si sta SCRIVENDO, viene rifiutata', async () => {
      const m = await controllaAssegnazioni(
        [{ data: '2026-07-20', staffId: 's9', dataScritta: true }],
        VENERDI,
      );
      expect(m.get(k('2026-07-20', 's9'))).toMatch(/fuori finestra/);
    });

    it('dentro la finestra il tabellone vale comunque, anche senza riscrivere la data', async () => {
      tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
      const m = await controllaAssegnazioni(
        [{ data: VENERDI, staffId: 's9', dataScritta: false }],
        VENERDI,
      );
      expect(m.get(k(VENERDI, 's9'))).toMatch(/senza attività DUNNING|nessun operatore/);
    });
  });

  it('nessuna coppia: nessuna lettura e nessun rifiuto', async () => {
    expect((await controllaAssegnazioni([], VENERDI)).size).toBe(0);
  });
});

/*
  La famiglia sceglie l'ATTIVITÀ che filtra il tabellone: DUNNING per il dunning, LIMITAZIONI
  MASSIVE per le massive. Stesso principio («chi quel giorno è sulla commessa»), attività diversa:
  un filtro solo avrebbe mostrato ai pianificatori delle massive la squadra del dunning.
*/
describe('operatoriPerGiorno — famiglia massive', () => {
  const suMassive = (day_id: string, id: string, nome: string): Riga =>
    assegna(day_id, id, nome, {
      activity_id: ATT.massive,
      activity: { name: 'LIMITAZIONI MASSIVE' },
      activity_ids: [ATT.massive],
    });

  it('vede chi ha LIMITAZIONI MASSIVE, non chi ha il dunning', async () => {
    tabelle.assignments = [
      suMassive('g1', 's1', 'BELLOMO PIETRO'),
      assegna('g1', 's2', 'CIARALLO ANNA'), // dunning: non è di questa vista
    ];
    const m = await operatoriPerGiorno([GIOVEDI], 'massive');
    expect(m.get(GIOVEDI)?.map((o) => o.id)).toEqual(['s1']);
  });

  it('specularmente, il dunning non vede chi fa solo le massive', async () => {
    tabelle.assignments = [suMassive('g1', 's1', 'BELLOMO PIETRO')];
    const m = await operatoriPerGiorno([GIOVEDI], 'dunning');
    expect(m.get(GIOVEDI)).toEqual([]);
  });

  it('le massive fra le attività MULTIPLE bastano, come per il dunning', async () => {
    tabelle.assignments = [
      assegna('g1', 's1', 'SIKORA JAN', {
        activity_id: ATT.clientela,
        activity: { name: 'CLIENTELA' },
        activity_ids: [ATT.clientela, ATT.massive],
      }),
    ];
    const m = await operatoriPerGiorno([GIOVEDI], 'massive');
    expect(m.get(GIOVEDI)?.map((o) => o.id)).toEqual(['s1']);
  });
});

describe('controllaAssegnazioni — famiglia massive', () => {
  it('il motivo nomina LIMITAZIONI MASSIVE, non DUNNING', async () => {
    const m = await controllaAssegnazioni(
      [{ data: VENERDI, staffId: 's1', dataScritta: true, famiglia: 'massive' }],
      VENERDI,
    );
    expect(m.get(k(VENERDI, 's1', 'massive'))).toBe(
      'nessun operatore con attività LIMITAZIONI MASSIVE in cronoprogramma per venerdì 31/07',
    );
  });

  it('chi ha SOLO il dunning viene rifiutato sulle massive', async () => {
    tabelle.assignments = [
      assegna('g2', 's1', 'CIARALLO ANNA'), // solo dunning
      assegna('g2', 's2', 'BELLOMO PIETRO', { // le massive quel giorno le fa un altro
        activity_id: ATT.massive, activity: { name: 'LIMITAZIONI MASSIVE' }, activity_ids: [ATT.massive],
      }),
    ];
    const m = await controllaAssegnazioni(
      [{ data: VENERDI, staffId: 's1', dataScritta: true, famiglia: 'massive' }],
      VENERDI,
    );
    expect(m.get(k(VENERDI, 's1', 'massive'))).toBe(
      'operatore senza attività LIMITAZIONI MASSIVE in cronoprogramma per venerdì 31/07',
    );
  });

  it('stessa coppia (giorno, operatore), verdetti INDIPENDENTI per famiglia', async () => {
    // È il motivo per cui la famiglia sta nella chiave: senza, il primo verdetto coprirebbe
    // il secondo e una riga massive passerebbe sull'idoneità dunning (o viceversa).
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni([
      { data: VENERDI, staffId: 's1', dataScritta: true, famiglia: 'dunning' },
      { data: VENERDI, staffId: 's1', dataScritta: true, famiglia: 'massive' },
    ], VENERDI);
    expect(m.get(k(VENERDI, 's1', 'dunning'))).toBeUndefined();
    expect(m.get(k(VENERDI, 's1', 'massive'))).toMatch(/LIMITAZIONI MASSIVE/);
  });

  it('senza famiglia vale il dunning: il default storico di tutte le chiamate', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.size).toBe(0);
  });
});
