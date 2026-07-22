import { describe, it, expect } from 'vitest';
import {
  costruisciNotePrecedenti,
  mappaNotePerIntervento,
  notaDaRisposte,
  normChiaveImpianto,
  normCommittente,
  MAX_NOTE_PRECEDENTI,
  type InterventoPrecedenteRow,
} from './notePrecedenti';

const intervento = (p: Partial<InterventoPrecedenteRow> & { id: string }): InterventoPrecedenteRow => ({
  committente: 'acea',
  data: '2026-07-01',
  matricola_contatore: null,
  pdr: null,
  intervento_tipo: null,
  staff_id: null,
  ...p,
});

describe('notaDaRisposte', () => {
  it('estrae e trimma la nota', () => {
    expect(notaDaRisposte({ note: '  misuratore in via Roma 5  ' })).toBe('misuratore in via Roma 5');
  });
  it('assente, vuota o non stringa → null', () => {
    expect(notaDaRisposte({})).toBeNull();
    expect(notaDaRisposte(null)).toBeNull();
    expect(notaDaRisposte({ note: '   ' })).toBeNull();
    expect(notaDaRisposte({ note: 42 })).toBeNull();
  });
});

describe('normChiaveImpianto', () => {
  it('trim + lowercase', () => {
    expect(normChiaveImpianto('  AB12 ')).toBe('ab12');
  });
  it('chiavi corte/placeholder → vuota (non identificanti)', () => {
    expect(normChiaveImpianto('-')).toBe('');
    expect(normChiaveImpianto('0')).toBe('');
    expect(normChiaveImpianto(null)).toBe('');
  });
});

describe('normCommittente', () => {
  it('trim + lowercase; vuoto → acea (default DB)', () => {
    expect(normCommittente(' Italgas ')).toBe('italgas');
    expect(normCommittente('')).toBe('acea');
    expect(normCommittente(null)).toBe('acea');
  });
});

describe('mappaNotePerIntervento', () => {
  it('prende la prima nota non vuota per intervento (ordine = preferenza)', () => {
    const m = mappaNotePerIntervento([
      { intervento_id: 'i1', risposte: { note: 'nota recente' } },
      { intervento_id: 'i1', risposte: { note: 'nota vecchia' } },
      { intervento_id: 'i2', risposte: { note: '   ' } },
      { intervento_id: null, risposte: { note: 'orfana' } },
    ]);
    expect(m.get('i1')).toBe('nota recente');
    expect(m.has('i2')).toBe(false);
    expect(m.size).toBe(1);
  });
});

describe('costruisciNotePrecedenti', () => {
  it('match per matricola: nota tramandata con data label, attività e operatore', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'acea', matricola: ' AB123 ', pdr: null }],
      interventi: [
        intervento({ id: 'i1', matricola_contatore: 'ab123', data: '2026-06-20', intervento_tipo: 'Limitazione flusso', staff_id: 's1' }),
      ],
      notePerIntervento: new Map([['i1', 'misuratore su altro indirizzo: via Bianchi 3']]),
      staffNomi: new Map([['s1', 'Mario Rossi']]),
    });
    expect(out.get('v1')).toEqual([
      {
        interventoId: 'i1',
        testo: 'misuratore su altro indirizzo: via Bianchi 3',
        data: '2026-06-20',
        dataLabel: '20/06/2026',
        attivita: 'Limitazione flusso',
        operatore: 'Mario Rossi',
      },
    ]);
  });

  it('match per PDR quando la matricola non coincide', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'acea', matricola: 'NUOVA1', pdr: 'PDR777' }],
      interventi: [intervento({ id: 'i1', matricola_contatore: 'VECCHIA9', pdr: 'pdr777' })],
      notePerIntervento: new Map([['i1', 'chiave pozzetto dal custode']]),
    });
    expect(out.get('v1')?.[0].testo).toBe('chiave pozzetto dal custode');
  });

  it('committente diverso NON tramanda (scope stesso committente)', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'italgas', matricola: 'AB123' }],
      interventi: [intervento({ id: 'i1', committente: 'acea', matricola_contatore: 'AB123' })],
      notePerIntervento: new Map([['i1', 'nota acea']]),
    });
    expect(out.size).toBe(0);
  });

  it('stesso committente diverso da acea tramanda regolarmente', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'italgas', matricola: 'AB123' }],
      interventi: [intervento({ id: 'i1', committente: 'italgas', matricola_contatore: 'AB123' })],
      notePerIntervento: new Map([['i1', 'nota italgas']]),
    });
    expect(out.get('v1')?.[0].testo).toBe('nota italgas');
  });

  it('committente assente sulla voce trattato come acea (default DB)', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', matricola: 'AB123' }],
      interventi: [intervento({ id: 'i1', committente: 'acea', matricola_contatore: 'AB123' })],
      notePerIntervento: new Map([['i1', 'nota acea default']]),
    });
    expect(out.get('v1')?.[0].testo).toBe('nota acea default');
  });

  it('interventi senza nota o collegati alle voci del rapportino sono esclusi', () => {
    const out = costruisciNotePrecedenti({
      voci: [
        { id: 'v1', committente: 'acea', matricola: 'AB123', interventoId: 'i-corrente' },
        { id: 'v2', committente: 'acea', matricola: 'AB123', interventoId: 'i-sorella' },
      ],
      interventi: [
        intervento({ id: 'i-corrente', matricola_contatore: 'AB123' }), // la voce stessa
        intervento({ id: 'i-sorella', matricola_contatore: 'AB123' }), // altra voce dello stesso giro
        intervento({ id: 'i-senza-nota', matricola_contatore: 'AB123' }),
      ],
      notePerIntervento: new Map([
        ['i-corrente', 'nota della voce stessa'],
        ['i-sorella', 'nota della sorella'],
      ]),
    });
    expect(out.size).toBe(0);
  });

  it('dedup per intervento quando matricola e PDR matchano entrambi', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'acea', matricola: 'AB123', pdr: 'PDR777' }],
      interventi: [intervento({ id: 'i1', matricola_contatore: 'AB123', pdr: 'PDR777' })],
      notePerIntervento: new Map([['i1', 'nota unica']]),
    });
    expect(out.get('v1')).toHaveLength(1);
  });

  it('ordina per data desc e taglia a MAX_NOTE_PRECEDENTI', () => {
    const interventi = ['2026-01-01', '2026-03-01', '2026-02-01', '2026-04-01', null].map((data, i) =>
      intervento({ id: `i${i}`, matricola_contatore: 'AB123', data }),
    );
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'acea', matricola: 'AB123' }],
      interventi,
      notePerIntervento: new Map(interventi.map((it) => [it.id, `nota ${it.id}`])),
    });
    const note = out.get('v1');
    expect(note).toHaveLength(MAX_NOTE_PRECEDENTI);
    expect(note?.map((n) => n.data)).toEqual(['2026-04-01', '2026-03-01', '2026-02-01']);
  });

  it('chiavi vuote o corte non agganciano nulla', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'acea', matricola: '-', pdr: '' }],
      interventi: [intervento({ id: 'i1', matricola_contatore: '-', pdr: null })],
      notePerIntervento: new Map([['i1', 'nota fantasma']]),
    });
    expect(out.size).toBe(0);
  });

  it('voce senza data intervento → dataLabel vuota', () => {
    const out = costruisciNotePrecedenti({
      voci: [{ id: 'v1', committente: 'acea', matricola: 'AB123' }],
      interventi: [intervento({ id: 'i1', matricola_contatore: 'AB123', data: null })],
      notePerIntervento: new Map([['i1', 'nota storica']]),
    });
    expect(out.get('v1')?.[0]).toMatchObject({ data: null, dataLabel: '', operatore: null });
  });
});
