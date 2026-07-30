import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Fake minimo di Supabase: regge la sola catena usata da `operatoriGiorno.ts`
  (`from(t).select(...).in(col, valori)` atteso). Le righe di `assignments` arrivano già nella
  forma che il join produce — il fake non sa fare join, e non è quello che questi test provano:
  qui si provano il dedup, le due sottrazioni delle assenze e il rifiuto fuori finestra.
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
const LUNEDI = '2026-08-03';

const assegna = (day_id: string, id: string, nome: string, extra: Riga = {}): Riga => ({
  day_id, staff_id: id, staff: { id, display_name: nome }, territory: null, activity: null, ...extra,
});

beforeEach(() => {
  tabelle.calendar_days = [
    { id: 'g1', day: GIOVEDI },
    { id: 'g2', day: VENERDI },
    { id: 'g3', day: LUNEDI },
  ];
  tabelle.assignments = [];
  tabelle.disponibilita_operatore = [];
});

describe('operatoriPerGiorno', () => {
  it('rende i nomi in tabellone, ordinati, con il territorio', () => {
    tabelle.assignments = [
      assegna('g1', 's2', 'PRATESI MARCO', { territory: { name: 'LAZIO EST' } }),
      assegna('g1', 's1', 'CIARALLO ANNA', { territory: { name: 'LAZIO CENTRO' } }),
    ];
    return operatoriPerGiorno([GIOVEDI]).then((m) => {
      expect(m.get(GIOVEDI)).toEqual([
        { id: 's1', display_name: 'CIARALLO ANNA', territorio: 'LAZIO CENTRO' },
        { id: 's2', display_name: 'PRATESI MARCO', territorio: 'LAZIO EST' },
      ]);
    });
  });

  it('una persona con più righe nello stesso giorno compare una volta sola', async () => {
    tabelle.assignments = [
      assegna('g1', 's1', 'CIARALLO ANNA'),
      assegna('g1', 's1', 'CIARALLO ANNA', { activity: { name: 'Limitazioni' } }),
    ];
    const m = await operatoriPerGiorno([GIOVEDI]);
    expect(m.get(GIOVEDI)).toHaveLength(1);
  });

  it('chi è a tabellone come assenza (vecchia forma) non è assegnabile', async () => {
    tabelle.assignments = [
      assegna('g1', 's1', 'CIARALLO ANNA', { activity: { name: 'Ferie' } }),
      assegna('g1', 's2', 'PRATESI MARCO'),
    ];
    const m = await operatoriPerGiorno([GIOVEDI]);
    expect(m.get(GIOVEDI)?.map((o) => o.id)).toEqual(['s2']);
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
  it('passa la coppia giusta: giorno in finestra, operatore in tabellone', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1' }], VENERDI);
    expect(m.size).toBe(0);
  });

  it('di venerdì il lunedì passa e il sabato no', async () => {
    tabelle.assignments = [assegna('g3', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni(
      [{ data: LUNEDI, staffId: 's1' }, { data: '2026-08-01', staffId: 's1' }],
      VENERDI,
    );
    expect(m.get(`${LUNEDI}|s1`)).toBeUndefined();
    expect(m.get(`2026-08-01|s1`)).toMatch(/fuori finestra/);
  });

  it('rifiuta una data lontana nominando i giorni buoni', async () => {
    const m = await controllaAssegnazioni([{ data: '2026-09-15', staffId: 's1' }], VENERDI);
    expect(m.get('2026-09-15|s1')).toBe(
      'martedì 15/09 è fuori finestra: si programma solo per venerdì 31/07 o lunedì 03/08',
    );
  });

  it('rifiuta chi quel giorno non è in tabellone, pur essendo giorno buono', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's9' }], VENERDI);
    expect(m.get(`${VENERDI}|s9`)).toBe('operatore non in cronoprogramma per venerdì 31/07');
  });

  it('tabellone vuoto: lo dice, invece di far cercare un operatore che non c’entra', async () => {
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1' }], VENERDI);
    expect(m.get(`${VENERDI}|s1`)).toBe('nessun operatore in cronoprogramma per venerdì 31/07');
  });

  it('chi è in tabellone ma in ferie intere quel giorno viene rifiutato', async () => {
    tabelle.assignments = [assegna('g2', 's1', 'CIARALLO ANNA')];
    tabelle.disponibilita_operatore = [{ staff_id: 's1', data: VENERDI, ora_da: null, ora_a: null }];
    const m = await controllaAssegnazioni([{ data: VENERDI, staffId: 's1' }], VENERDI);
    expect(m.get(`${VENERDI}|s1`)).toMatch(/nessun operatore in cronoprogramma/);
  });

  it('nessuna coppia: nessuna lettura e nessun rifiuto', async () => {
    expect((await controllaAssegnazioni([], VENERDI)).size).toBe(0);
  });
});
