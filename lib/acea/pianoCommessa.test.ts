import { describe, it, expect } from 'vitest';
import { makeFakeDb, type Tables } from '@/lib/interventi/testUtils/fakeSupabase';
import {
  eNotaContenitore, interventoToTask, scegliPianoCommessa, sincronizzaOperatorePiano,
} from './pianoCommessa';
import { taskIdAcea } from './vociRapportino';

describe('interventoToTask', () => {
  it('id deterministico (taskIdAcea) e mapping completo dei campi anagrafici', () => {
    const t = interventoToTask({
      id: 'i1', odl: ' 912215286 ', pdr: 'PDR9', matricola_contatore: 'M1',
      nominativo: 'ROSSI MARIO', recapito: '333123', indirizzo: 'VIA ALFA 1',
      comune: 'ROMA', cap: '00100', intervento_tipo: 'RIATTIVAZIONE',
      diametro: 'DN15', committente: 'acqualatina', fascia_oraria: '8-13',
    });
    expect(t).toMatchObject({
      id: taskIdAcea('i1'),        // = task_id della voce acea: il match esatto di G1
      odl: '912215286',            // trim: l'ODL viaggia pulito come nel percorso Excel
      pdr: 'PDR9', matricola: 'M1', nominativo: 'ROSSI MARIO', recapito: '333123',
      indirizzo: 'VIA ALFA 1', citta: 'ROMA', cap: '00100',
      attivita: 'RIATTIVAZIONE', calibro: 'DN15', fascia_oraria: '8-13',
    });
    // Committente ESPLICITO: se mai la Mappa rigenerasse questo task, taskToIntervento non
    // deve reinstradarlo con la sonda tassonomia cross-catalogo.
    expect(t.committente).toBe('acqualatina');
  });

  it('campi assenti → stringhe vuote/undefined, mai crash', () => {
    const t = interventoToTask({ id: 'i2' });
    expect(t.id).toBe(taskIdAcea('i2'));
    expect(t.odl).toBe('');
    expect(t.indirizzo).toBe('');
    expect(t.citta).toBe('');
    expect(t.matricola).toBeUndefined();
    expect(t.committente).toBeUndefined();
  });
});

describe('eNotaContenitore', () => {
  it('riconosce entrambe le varianti storiche della nota-sentinella', () => {
    expect(eNotaContenitore('Contenitore dei rapportini generati dal registro commesse.')).toBe(true);
    expect(eNotaContenitore('Contenitore dei rapportini della commessa ACEA.')).toBe(true);
    expect(eNotaContenitore('Giro di Latina, priorità mattina')).toBe(false);
    expect(eNotaContenitore(null)).toBe(false);
    expect(eNotaContenitore('')).toBe(false);
  });
});

describe('scegliPianoCommessa', () => {
  const piani = [
    { id: 'p-vecchio', created_at: '2026-08-01T06:00:00Z' },
    { id: 'p-medio', created_at: '2026-08-01T08:00:00Z' },
    { id: 'p-nuovo', created_at: '2026-08-01T10:00:00Z' },
  ];

  it('precedenza 1: il piano dove l’operatore ha già il rapportino vince su tutto', () => {
    expect(scegliPianoCommessa(piani, new Set(['p-nuovo']), new Set(['p-medio']))).toBe('p-nuovo');
  });

  it('precedenza 2: senza rapportino, vince il piano dove è già in mappa_piani_operatori', () => {
    expect(scegliPianoCommessa(piani, new Set(), new Set(['p-medio']))).toBe('p-medio');
  });

  it('precedenza 3: altrimenti il più vecchio per created_at', () => {
    expect(scegliPianoCommessa(piani, new Set(), new Set())).toBe('p-vecchio');
  });

  it('precedenza 4: nessun piano → null (il chiamante crea)', () => {
    expect(scegliPianoCommessa([], new Set(), new Set())).toBeNull();
  });

  it('determinismo a parità di created_at: spareggio per id', () => {
    const pari = [
      { id: 'p-b', created_at: '2026-08-01T06:00:00Z' },
      { id: 'p-a', created_at: '2026-08-01T06:00:00Z' },
    ];
    expect(scegliPianoCommessa(pari, new Set(), new Set())).toBe('p-a');
    // L'ordine dell'array in ingresso non conta.
    expect(scegliPianoCommessa([...pari].reverse(), new Set(), new Set())).toBe('p-a');
  });
});

describe('sincronizzaOperatorePiano', () => {
  const seed = (over: Partial<Tables> = {}): Tables => ({
    interventi: [],
    mappa_piani_operatori: [],
    staff: [{ id: 's1', display_name: 'MARIO ROSSI' }],
    ...over,
  });

  const interventoRegistro = (id: string, over: Record<string, unknown> = {}) => ({
    id, piano_id: 'p1', staff_id: 's1', odl: `ODL-${id}`, stato: 'assegnato',
    committente: 'acqualatina', matricola_contatore: `M-${id}`, indirizzo: 'VIA X',
    created_from_mappa: false, origine: 'pianificato',
    ...over,
  });

  it('crea la riga operatore con i task acea:* degli interventi del registro', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [interventoRegistro('i1'), interventoRegistro('i2')],
    }));
    const r = await sincronizzaOperatorePiano(db, 'p1', 's1');
    expect(r.ok).toBe(true);
    expect(tables.mappa_piani_operatori).toHaveLength(1);
    const riga = tables.mappa_piani_operatori[0];
    expect(riga).toMatchObject({ piano_id: 'p1', staff_id: 's1', staff_name: 'MARIO ROSSI', task_count: 2 });
    expect((riga.tasks as Array<{ id: string }>).map((t) => t.id).sort())
      .toEqual([taskIdAcea('i1'), taskIdAcea('i2')].sort());
  });

  it('esclude annullati, manuali dal «+» e righe della Mappa (già nei task del piano)', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [
        interventoRegistro('i1'),
        interventoRegistro('i2', { stato: 'annullato' }),
        interventoRegistro('i3', { origine: 'manuale' }),
        interventoRegistro('i4', { created_from_mappa: true }),
      ],
    }));
    const r = await sincronizzaOperatorePiano(db, 'p1', 's1');
    expect(r.ok).toBe(true);
    expect((tables.mappa_piani_operatori[0].tasks as Array<{ id: string }>).map((t) => t.id))
      .toEqual([taskIdAcea('i1')]);
  });

  it('riga esistente: preserva i task NON acea (Excel) e riscrive solo i propri', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [interventoRegistro('i9')],
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'MARIO ROSSI',
        task_count: 2, tasks: [{ id: 'row-1', odl: 'Z' }, { id: taskIdAcea('vecchio'), odl: 'V' }],
      }],
    }));
    const r = await sincronizzaOperatorePiano(db, 'p1', 's1');
    expect(r.ok).toBe(true);
    const riga = tables.mappa_piani_operatori[0];
    // `acea:vecchio` (intervento sparito) è stato rimosso, `row-1` (Excel) preservato.
    expect((riga.tasks as Array<{ id: string }>).map((t) => t.id)).toEqual(['row-1', taskIdAcea('i9')]);
    expect(riga.task_count).toBe(2);
  });

  it('la riga resta anche a 0 task (come un piano Excel svuotato): toglierla innescherebbe orphanRapportini', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [],
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'MARIO ROSSI',
        task_count: 1, tasks: [{ id: taskIdAcea('sparito'), odl: 'V' }],
      }],
    }));
    const r = await sincronizzaOperatorePiano(db, 'p1', 's1');
    expect(r.ok).toBe(true);
    expect(tables.mappa_piani_operatori).toHaveLength(1);
    expect(tables.mappa_piani_operatori[0]).toMatchObject({ task_count: 0, tasks: [] });
  });
});
