import { describe, it, expect } from 'vitest';
import { makeFakeDb, type Row, type Tables } from '@/lib/interventi/testUtils/fakeSupabase';
import { sincronizzaRapportiniAcea } from './sincronizzaRapportiniAcea';
import { taskIdAcea } from './vociRapportino';

const DATA = '2026-07-28';
const ATTORE = 'admin-1';

const intervento = (over: Partial<Row> = {}): Row => ({
  id: 'i1', odl: '912215286', staff_id: 's1', data: DATA, stato: 'assegnato',
  committente: 'acea', intervento_tipo: 'RIATTIVAZIONE', gruppo_attivita: 'LIMITAZIONI/SOSPENSIONI',
  indirizzo: 'VIA ALFA 1', comune: 'ROMA', cap: '00100',
  matricola_contatore: '202015213300', nominativo: null, pdr: null,
  ...over,
});

/** Un flusso ACEA collegato + un modello generico: la stessa configurazione del progetto. */
const templates = (): Row[] => [
  {
    id: 'fl-dunning', nome: 'LIMITAZIONI/SOSPENSIONI', active: true, solo_manuale: false,
    tipo: 'standard', campi: [{ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'crocetta', ordine: 1 }],
    info_campi: [], gruppo_committente: 'acea', gruppi_attivita: ['LIMITAZIONI/SOSPENSIONI'],
  },
  {
    id: 'tpl-standard', nome: 'Standard', active: true, solo_manuale: false, tipo: 'standard',
    campi: [], info_campi: [], gruppo_committente: null, gruppi_attivita: null,
  },
];

const seed = (over: Partial<Tables> = {}): Tables => ({
  interventi: [intervento()],
  rapportini: [],
  rapportino_voci: [],
  rapportino_template: templates(),
  mappa_piani: [],
  staff: [{ id: 's1', display_name: 'MARIO ROSSI' }, { id: 's2', display_name: 'LUCA BIANCHI' }],
  ...over,
});

const vociDi = (tables: Tables, rapportinoId: string) =>
  (tables.rapportino_voci ?? []).filter((v) => v.rapportino_id === rapportinoId);

describe('sincronizzaRapportiniAcea', () => {
  it('operatore senza rapportino: lo crea su un piano VERO della commessa, con riga operatore e task', async () => {
    const { db, tables } = makeFakeDb(seed());
    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti).toHaveLength(1);
    expect(r.esiti[0]).toMatchObject({
      staff_id: 's1', staff_name: 'MARIO ROSSI', esito: 'creato', voci_aggiunte: 1,
    });

    // Il piano è un piano VERO (unificazione col percorso Excel): territorio della commessa,
    // nessuna nota-sentinella, e l'operatore registrato in mappa_piani_operatori con i task
    // `acea:*` — è ciò che la vista pianifica legge e ciò che tiene il rapportino al riparo
    // da orphanRapportini. Il vecchio guscio senza operatori è morto qui.
    expect(tables.mappa_piani).toHaveLength(1);
    expect(tables.mappa_piani[0]).toMatchObject({ data: DATA, territorio: 'ACEA', created_by: ATTORE, note: null });
    expect(tables.mappa_piani_operatori ?? []).toHaveLength(1);
    expect(tables.mappa_piani_operatori[0]).toMatchObject({
      staff_id: 's1', staff_name: 'MARIO ROSSI', task_count: 1,
    });
    expect((tables.mappa_piani_operatori[0].tasks as Array<{ id: string }>).map((t) => t.id))
      .toEqual([taskIdAcea('i1')]);
    // L'intervento riceve il piano_id del piano vero (backfill dell'adozione).
    expect(tables.interventi[0].piano_id).toBe(String(tables.mappa_piani[0].id));

    expect(tables.rapportini).toHaveLength(1);
    expect(tables.rapportini[0]).toMatchObject({ staff_id: 's1', data: DATA, stato: 'in_corso' });
    const voci = vociDi(tables, String(tables.rapportini[0].id));
    expect(voci).toHaveLength(1);
    expect(voci[0]).toMatchObject({
      origine: 'acea', manuale: false, intervento_id: 'i1', task_id: taskIdAcea('i1'),
      odl: '912215286', via: 'VIA ALFA 1', comune: 'ROMA', matricola: '202015213300', ordine: 1,
    });
  });

  it('rapportino Italgas già presente: aggiunge in coda e non tocca le voci altrui', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{
        id: 'rap-italgas', staff_id: 's1', staff_name: 'MARIO ROSSI', data: DATA,
        stato: 'in_corso', token: 'tok-it', piano_id: 'p-italgas', created_at: '2026-07-27T06:00:00Z',
      }],
      rapportino_voci: [
        { id: 'v-it-1', rapportino_id: 'rap-italgas', task_id: 'row-1', origine: 'task', odl: 'ODS-1', ordine: 1, risposte: { eseguito: 'SI' } },
        { id: 'v-it-2', rapportino_id: 'rap-italgas', task_id: 'row-2', origine: 'task', odl: 'ODS-2', ordine: 2, risposte: {} },
      ],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti[0]).toMatchObject({ esito: 'aggiunto', rapportino_id: 'rap-italgas', voci_aggiunte: 1 });

    // Nessun secondo rapportino: si è attaccato a quello che c'era (regola «un rapportino per
    // operatore per giorno», il rapportino non si sposta mai). Il piano ACEA però ora ESISTE:
    // l'adozione crea comunque il piano vero della commessa — con riga operatore e task — così
    // il lavoro è visibile in pianifica anche se il rapportino vive sul piano Italgas.
    expect(tables.rapportini).toHaveLength(1);
    expect(tables.mappa_piani).toHaveLength(1);
    expect(tables.mappa_piani[0]).toMatchObject({ data: DATA, territorio: 'ACEA' });
    expect(tables.mappa_piani_operatori ?? []).toHaveLength(1);
    expect(tables.interventi[0].piano_id).toBe(String(tables.mappa_piani[0].id));

    const voci = vociDi(tables, 'rap-italgas');
    expect(voci).toHaveLength(3);
    // Le voci Italgas sono intatte, risposte comprese.
    expect(voci.find((v) => v.id === 'v-it-1')).toMatchObject({ origine: 'task', risposte: { eseguito: 'SI' } });
    const acea = voci.find((v) => v.origine === 'acea')!;
    expect(acea.ordine).toBe(3);                       // in coda, non in mezzo al giro
    expect((acea.raw_json as { _nuovo?: boolean })._nuovo).toBe(true);  // evidenziata all'operatore
  });

  it('rapportino già inviato: non lo tocca e chiede conferma', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{
        id: 'rap-inviato', staff_id: 's1', staff_name: 'MARIO ROSSI', data: DATA,
        stato: 'inviato', token: 'tok-inv', piano_id: 'p1', created_at: '2026-07-27T06:00:00Z',
      }],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti[0]).toMatchObject({ esito: 'richiede_riapertura', voci_aggiunte: 0 });
    expect(tables.rapportino_voci).toHaveLength(0);
    expect(tables.rapportini[0].stato).toBe('inviato');
  });

  it('con conferma riapre il rapportino inviato e aggiunge le voci', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{
        id: 'rap-inviato', staff_id: 's1', staff_name: 'MARIO ROSSI', data: DATA,
        stato: 'inviato', token: 'tok-inv', piano_id: 'p1', created_at: '2026-07-27T06:00:00Z',
      }],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE, confermaRiaperture: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti[0]).toMatchObject({ esito: 'aggiunto', voci_aggiunte: 1 });
    expect(tables.rapportini[0].stato).toBe('in_corso');
    expect(tables.rapportini[0].riaperto_at).toBeTruthy();
  });

  it('inviato ma senza voci nuove: nessuna modifica, non chiede una riapertura inutile', async () => {
    const { db } = makeFakeDb(seed({
      rapportini: [{
        id: 'rap-inviato', staff_id: 's1', staff_name: 'MARIO ROSSI', data: DATA,
        stato: 'inviato', token: 'tok-inv', piano_id: 'p1', created_at: '2026-07-27T06:00:00Z',
      }],
      rapportino_voci: [{
        id: 'v-acea', rapportino_id: 'rap-inviato', task_id: taskIdAcea('i1'), intervento_id: 'i1',
        origine: 'acea', odl: '912215286', ordine: 1, risposte: { eseguito: 'SI' },
      }],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti[0]).toMatchObject({ esito: 'nessuna_modifica', voci_gia_presenti: 1, voci_aggiunte: 0 });
  });

  it('secondo giro identico: nessuna voce duplicata', async () => {
    const { db, tables } = makeFakeDb(seed());
    const primo = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(primo.ok).toBe(true);
    const secondo = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });

    expect(secondo.ok).toBe(true);
    if (!secondo.ok) return;
    expect(secondo.esiti[0]).toMatchObject({ esito: 'nessuna_modifica', voci_gia_presenti: 1 });
    expect(tables.rapportino_voci).toHaveLength(1);
    expect(tables.rapportini).toHaveLength(1);
    expect(tables.mappa_piani).toHaveLength(1);     // il piano-contenitore si riusa
  });

  it('due operatori nello stesso giorno condividono un solo piano della commessa', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [
        intervento({ id: 'i1', staff_id: 's1', odl: '1' }),
        intervento({ id: 'i2', staff_id: 's2', odl: '2' }),
      ],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    expect(tables.mappa_piani).toHaveLength(1);
    expect(tables.rapportini).toHaveLength(2);
    // Una riga operatore a testa, sullo stesso piano: come un piano Excel a due operatori.
    expect((tables.mappa_piani_operatori ?? []).map((o) => o.staff_id).sort()).toEqual(['s1', 's2']);
  });

  it('la voce porta il flusso del gruppo attività del suo intervento', async () => {
    const { db, tables } = makeFakeDb(seed());
    await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    const voce = tables.rapportino_voci[0];
    expect(voce.template_id).toBe('fl-dunning');
    expect(voce.campi_snapshot).toEqual([
      { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'crocetta', ordine: 1 },
    ]);
    // Anche il rapportino nasce sul flusso della commessa, non sul modello generico.
    expect(tables.rapportini[0].template_id).toBe('fl-dunning');
  });

  it('esclude gli annullati e segnala gli interventi senza esecutore', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [
        intervento({ id: 'i1', stato: 'annullato' }),
        intervento({ id: 'i2', odl: '2', staff_id: null }),
        intervento({ id: 'i3', odl: '3' }),
      ],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avvisi[0]).toMatch(/non hanno un esecutore/);
    expect(tables.rapportino_voci).toHaveLength(1);
    expect(tables.rapportino_voci[0].odl).toBe('3');
  });

  it('non genera una seconda voce per un ODL già presente come voce da task', async () => {
    // Transizione: il vecchio flusso da master ha già messo l'ODL nel rapportino.
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{
        id: 'rap1', staff_id: 's1', staff_name: 'MARIO ROSSI', data: DATA,
        stato: 'in_corso', token: 'tok', piano_id: 'p1', created_at: '2026-07-27T06:00:00Z',
      }],
      rapportino_voci: [{
        id: 'v1', rapportino_id: 'rap1', task_id: 'row-3', origine: 'task',
        odl: '912215286', ordine: 1, risposte: {},
      }],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti[0]).toMatchObject({ esito: 'nessuna_modifica', voci_gia_presenti: 1 });
    expect(tables.rapportino_voci).toHaveLength(1);
  });

  it('il filtro per operatore lascia fuori gli altri', async () => {
    const { db, tables } = makeFakeDb(seed({
      interventi: [
        intervento({ id: 'i1', staff_id: 's1', odl: '1' }),
        intervento({ id: 'i2', staff_id: 's2', odl: '2' }),
      ],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE, staffIds: ['s2'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti.map((e) => e.staff_id)).toEqual(['s2']);
    expect(tables.rapportini).toHaveLength(1);
  });

  it('senza interventi del giorno non crea né piano né rapportini', async () => {
    const { db, tables } = makeFakeDb(seed({ interventi: [] }));
    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esiti).toEqual([]);
    expect(tables.mappa_piani).toHaveLength(0);
  });

  it('rifiuta una data non valida prima di toccare il database', async () => {
    const { db, tables } = makeFakeDb(seed());
    const r = await sincronizzaRapportiniAcea(db, { data: '28/07/2026', attoreId: ATTORE });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(tables.rapportini).toHaveLength(0);
  });
});

/*
  L'ADOZIONE: i piani-contenitore storici e gli interventi senza piano guariscono al primo
  «Genera rapportini». È il passo di retro-compatibilità: nessuna migration SQL, il codice
  sana i dati che incontra — e lo fa in modo idempotente.
*/
describe('sincronizzaRapportiniAcea — adozione del piano', () => {
  const NOTA_CONTENITORE = 'Contenitore dei rapportini generati dal registro commesse.';

  it('contenitore storico con rapportino appeso: riga operatore, task, backfill piano_id, nota azzerata — rapportino MAI spostato', async () => {
    const { db, tables } = makeFakeDb(seed({
      mappa_piani: [{
        id: 'pc', data: DATA, territorio: 'ACEA', note: NOTA_CONTENITORE,
        stato: 'confermato', created_at: '2026-07-28T05:00:00Z',
      }],
      rapportini: [{
        id: 'rapc', staff_id: 's1', staff_name: 'MARIO ROSSI', data: DATA,
        stato: 'in_corso', token: 'tokc', piano_id: 'pc', created_at: '2026-07-28T06:00:00Z',
      }],
      interventi: [intervento({ id: 'i1', piano_id: null })],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Il rapportino resta dov'era (stesso id, stesso token): è il piano a diventare vero.
    expect(r.esiti[0]).toMatchObject({ esito: 'aggiunto', rapportino_id: 'rapc' });
    expect(tables.rapportini).toHaveLength(1);
    expect(tables.rapportini[0]).toMatchObject({ id: 'rapc', piano_id: 'pc', token: 'tokc' });
    // Il contenitore è stato adottato: riga operatore con i task e nota-sentinella azzerata.
    expect(tables.mappa_piani).toHaveLength(1);
    expect(tables.mappa_piani[0].note).toBeNull();
    expect(tables.mappa_piani_operatori).toHaveLength(1);
    expect(tables.mappa_piani_operatori[0]).toMatchObject({ piano_id: 'pc', staff_id: 's1', task_count: 1 });
    // L'intervento orfano di piano è stato agganciato al piano del rapportino.
    expect(tables.interventi[0].piano_id).toBe('pc');
  });

  it('operatore già nel piano Excel del giorno: converge lì (regola riga operatore), preservando i task Excel', async () => {
    const { db, tables } = makeFakeDb(seed({
      mappa_piani: [{ id: 'px', data: DATA, territorio: 'ACEA', note: null, created_at: '2026-07-28T05:00:00Z' }],
      mappa_piani_operatori: [{
        piano_id: 'px', staff_id: 's1', staff_name: 'MARIO ROSSI', colore: '#2563EB',
        km: 0, task_count: 1, tasks: [{ id: 'row-1', odl: 'Z9' }], polyline: [],
      }],
    }));

    const r = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(r.ok).toBe(true);
    // Nessun piano nuovo: commessa ed Excel condividono il piano dell'operatore.
    expect(tables.mappa_piani).toHaveLength(1);
    expect(tables.rapportini[0].piano_id).toBe('px');
    expect(tables.interventi[0].piano_id).toBe('px');
    // I task Excel restano, il task della commessa si accoda: il motore possiede solo gli `acea:*`.
    const riga = tables.mappa_piani_operatori[0];
    expect((riga.tasks as Array<{ id: string }>).map((t) => t.id)).toEqual(['row-1', taskIdAcea('i1')]);
    expect(riga.task_count).toBe(2);
  });

  it('idempotente: il secondo giro non duplica né piano, né riga operatore, né task, né voci', async () => {
    const { db, tables } = makeFakeDb(seed());
    const primo = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(primo.ok).toBe(true);
    const secondo = await sincronizzaRapportiniAcea(db, { data: DATA, attoreId: ATTORE });
    expect(secondo.ok).toBe(true);
    if (!secondo.ok) return;
    expect(secondo.esiti[0]).toMatchObject({ esito: 'nessuna_modifica' });
    expect(tables.mappa_piani).toHaveLength(1);
    expect(tables.mappa_piani_operatori).toHaveLength(1);
    expect((tables.mappa_piani_operatori[0].tasks as unknown[]).length).toBe(1);
    expect(tables.rapportino_voci).toHaveLength(1);
  });
});

/*
  L'AGGANCIO fra la colonna «Note» della tabella e il rapportino dell'operatore.

  La nota scritta sul registro deve finire in `raw_json.note`: e` la chiave che
  `notaUfficioFromRaw` legge per disegnare il banner «Nota dall'ufficio» in cima alla card. Un
  nome diverso avrebbe voluto dire un secondo motore di note accanto a quello che esisteva gia`.

  Se questo si rompe, la nota si scrive e non arriva a nessuno: il caso peggiore, perche` chi la
  scrive crede di aver avvisato l'operatore.
*/
describe('la nota dell’ufficio arriva al rapportino', () => {
  it('viaggia nella chiave che il rapportino legge davvero', async () => {
    const { notaUfficioFromRaw } = await import('@/utils/rapportini/notaUfficio');
    // Il contratto in due righe: come la scriviamo, e come viene riletta.
    expect(notaUfficioFromRaw({ _acea: true, note: 'Citofonare interno 4' }))
      .toBe('Citofonare interno 4');
    // Senza nota il banner non deve comparire: `raw_json` senza la chiave.
    expect(notaUfficioFromRaw({ _acea: true })).toBeUndefined();
    expect(notaUfficioFromRaw({ _acea: true, note: '   ' })).toBeUndefined();
  });
});
