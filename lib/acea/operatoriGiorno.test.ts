import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Fake minimo di Supabase: regge la sola catena usata da `operatoriGiorno.ts`
  (`from(t).select(...).in(col, valori)` atteso). Le righe di `assignments` arrivano già nella
  forma che il join produce — il fake non sa fare join, e non è quello che questi test provano:
  qui si provano il filtro per attività DUNNING, il dedup, le sottrazioni delle assenze e il
  rifiuto fuori finestra.
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

const { controllaAssegnazioni, operatoriPerGiorno } = await import('./operatoriGiorno');

const GIOVEDI = '2026-07-30';
const VENERDI = '2026-07-31';
const SABATO = '2026-08-01';
const LUNEDI = '2026-08-03';

/** Attività di tabellone: il dunning e le altre. Nomi come in produzione. */
const ATT = {
  dunning: 'act-dunning',
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

// Il controllo sta sul server e non solo nel menu: la griglia accetta un incolla da Excel, e una
// regola applicata alla sola UI si aggira con Ctrl+V.
describe('controllaAssegnazioni', () => {
  it('passa la coppia giusta: giorno in finestra, operatore col dunning in tabellone', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.size).toBe(0);
  });

  it('di venerdì il sabato passa (è lavorativo) e il lunedì no: è troppo in là', async () => {
    tabelle.assignments = [assegna('g4', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni(
      [{ data: SABATO, staffId: 's1', dataScritta: true }, { data: LUNEDI, staffId: 's1', dataScritta: true }],
      VENERDI,
    );
    expect(m.get(`${SABATO}|s1`)).toBeUndefined();
    expect(m.get(`${LUNEDI}|s1`)).toMatch(/fuori finestra/);
  });

  it('rifiuta una data lontana nominando i giorni buoni', async () => {
    const m = await controllaAssegnazioni([{ data: '2026-09-15', staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.get('2026-09-15|s1')).toBe(
      'martedì 15/09 è fuori finestra: si programma solo per venerdì 31/07 o sabato 01/08',
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
    expect(m.get(`${VENERDI}|s9`)).toBe('operatore senza attività DUNNING in cronoprogramma per venerdì 31/07');
  });

  it('tabellone senza nessuno sul dunning: lo dice', async () => {
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.get(`${VENERDI}|s1`)).toBe(
      'nessun operatore con attività DUNNING in cronoprogramma per venerdì 31/07',
    );
  });

  it('chi è in tabellone ma in ferie intere quel giorno viene rifiutato', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    tabelle.disponibilita_operatore = [{ staff_id: 's1', data: VENERDI, ora_da: null, ora_a: null }];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1', dataScritta: true }], VENERDI);
    expect(m.get(`${VENERDI}|s1`)).toMatch(/nessun operatore con attività DUNNING/);
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
      expect(m.get('2026-07-20|s9')).toMatch(/fuori finestra/);
    });

    it('dentro la finestra il tabellone vale comunque, anche senza riscrivere la data', async () => {
      tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
      const m = await controllaAssegnazioni(
        [{ data: VENERDI, staffId: 's9', dataScritta: false }],
        VENERDI,
      );
      expect(m.get(`${VENERDI}|s9`)).toMatch(/senza attività DUNNING|nessun operatore/);
    });
  });

  it('nessuna coppia: nessuna lettura e nessun rifiuto', async () => {
    expect((await controllaAssegnazioni([], VENERDI)).size).toBe(0);
  });
});
