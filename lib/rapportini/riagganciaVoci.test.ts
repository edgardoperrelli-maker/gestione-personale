// lib/rapportini/riagganciaVoci.test.ts
// Il caso vero: PICARRO viveva nel gruppo «P.I.» e le voci già generate portano congelato il
// flusso del P.I. Gli si dà un gruppo suo con le sue azioni, ma il rapportino del giro è già
// in mano all'operatore e non si può rigenerare → le voci vanno riagganciate sul posto.
import { describe, it, expect } from 'vitest';
import { makeFakeDb, type Tables } from '@/lib/interventi/testUtils/fakeSupabase';
import { calcolaRiagganci, riagganciaVociAperte } from './riagganciaVoci';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const NOW = '2026-08-06T10:00:00Z';
const OGGI = '2026-08-06';

const CAMPI_PI: TemplateCampo[] = [
  { chiave: 'n_segnalazione', etichetta: 'N° SEGNALAZIONE', tipo: 'testo', obbligatoria: true, ordine: 1 },
];
const CAMPI_PICARRO: TemplateCampo[] = [
  { chiave: 'metri_ispezionati', etichetta: 'METRI ISPEZIONATI', tipo: 'testo', obbligatoria: true, ordine: 1 },
];

const FLUSSO_PI = { id: 'tplPI', nome: 'P.I.', campi: CAMPI_PI, gruppo_committente: 'italgas', gruppi_attivita: ['P.I.'] };
const FLUSSO_PICARRO = { id: 'tplPIC', nome: 'PICARRO', campi: CAMPI_PICARRO, gruppo_committente: 'italgas', gruppi_attivita: ['PICARRO'] };

describe('calcolaRiagganci', () => {
  const interventi = [{ id: 'i1', committente: 'italgas', gruppo_attivita: 'PICARRO' }];

  it('voce appesa al flusso vecchio → passa al flusso del suo gruppo, con le azioni nuove', () => {
    const out = calcolaRiagganci(
      [{ id: 'v1', intervento_id: 'i1', template_id: 'tplPI' }],
      interventi,
      [FLUSSO_PI, FLUSSO_PICARRO],
    );
    expect(out).toEqual([{ id: 'v1', template_id: 'tplPIC', campi_snapshot: CAMPI_PICARRO }]);
  });

  it('voce già sul flusso giusto → niente da fare (nessuna scrittura inutile)', () => {
    expect(calcolaRiagganci([{ id: 'v1', intervento_id: 'i1', template_id: 'tplPIC' }], interventi, [FLUSSO_PICARRO])).toEqual([]);
  });

  it('gruppo senza flusso → si lascia com’è: mai togliere le azioni a un rapportino aperto', () => {
    expect(calcolaRiagganci([{ id: 'v1', intervento_id: 'i1', template_id: 'tplPI' }], interventi, [FLUSSO_PI])).toEqual([]);
  });

  it('flusso di destinazione senza azioni → non è una destinazione', () => {
    const vuoto = { ...FLUSSO_PICARRO, campi: [] };
    expect(calcolaRiagganci([{ id: 'v1', intervento_id: 'i1', template_id: 'tplPI' }], interventi, [FLUSSO_PI, vuoto])).toEqual([]);
  });

  it('voce senza intervento (vive sul modello del rapportino) → non si tocca', () => {
    expect(calcolaRiagganci([{ id: 'v1', intervento_id: null, template_id: 'tplPI' }], interventi, [FLUSSO_PICARRO])).toEqual([]);
  });

  it('committente equivalente e gruppo con spazi/accenti: il match è normalizzato', () => {
    const out = calcolaRiagganci(
      [{ id: 'v1', intervento_id: 'i2', template_id: null }],
      [{ id: 'i2', committente: 'lim_massive', gruppo_attivita: '  dunning ' }],
      [{ id: 'tplD', nome: 'DUNNING', campi: CAMPI_PICARRO, gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'] }],
    );
    expect(out.map((r) => r.template_id)).toEqual(['tplD']);
  });
});

function seed(over: Partial<Tables> = {}): Tables {
  return {
    rapportini: [
      { id: 'r1', template_id: 'tplX', data: OGGI, stato: 'in_corso', riaperto_at: null },
      { id: 'r2', template_id: 'tplX', data: OGGI, stato: 'inviato', riaperto_at: null },
    ],
    rapportino_voci: [
      { id: 'v1', rapportino_id: 'r1', intervento_id: 'i1', template_id: 'tplPI', campi_snapshot: CAMPI_PI },
      { id: 'v2', rapportino_id: 'r2', intervento_id: 'i2', template_id: 'tplPI', campi_snapshot: CAMPI_PI },
    ],
    interventi: [
      { id: 'i1', committente: 'italgas', gruppo_attivita: 'PICARRO' },
      { id: 'i2', committente: 'italgas', gruppo_attivita: 'PICARRO' },
    ],
    rapportino_template: [
      { ...FLUSSO_PI, active: true },
      { ...FLUSSO_PICARRO, active: true },
    ],
    ...over,
  };
}

describe('riagganciaVociAperte', () => {
  it('la voce del rapportino ancora aperto passa al flusso nuovo; l’inviato resta com’è', async () => {
    const { db, tables } = makeFakeDb(seed());
    const esito = await riagganciaVociAperte(db, NOW);
    expect(esito).toEqual({ voci: 1 });
    const v1 = tables.rapportino_voci.find((v) => v.id === 'v1');
    expect(v1?.template_id).toBe('tplPIC');
    expect(v1?.campi_snapshot).toEqual(CAMPI_PICARRO);
    const v2 = tables.rapportino_voci.find((v) => v.id === 'v2');
    expect(v2?.template_id).toBe('tplPI');
    expect(v2?.campi_snapshot).toEqual(CAMPI_PI);
  });

  it('filtro per gruppi del flusso salvato: fuori da quei gruppi non si tocca niente', async () => {
    const { db, tables } = makeFakeDb(seed());
    const esito = await riagganciaVociAperte(db, NOW, { gruppi: { committente: 'italgas', nomi: ['ALTRO GRUPPO'] } });
    expect(esito).toEqual({ voci: 0 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.template_id).toBe('tplPI');
  });

  it('filtro per interventi riallineati: prende la voce di quell’intervento', async () => {
    const { db, tables } = makeFakeDb(seed());
    expect(await riagganciaVociAperte(db, NOW, { interventiIds: ['i1'] })).toEqual({ voci: 1 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.template_id).toBe('tplPIC');
  });

  it('lista di interventi vuota → nessuna query, nessuna scrittura', async () => {
    const { db, tables } = makeFakeDb(seed());
    expect(await riagganciaVociAperte(db, NOW, { interventiIds: [] })).toEqual({ voci: 0 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.template_id).toBe('tplPI');
  });

  it('filtro per rapportino (riapertura): tocca solo quello riaperto', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [
        { id: 'r1', template_id: 'tplX', data: OGGI, stato: 'in_corso', riaperto_at: null },
        { id: 'r3', template_id: 'tplX', data: OGGI, stato: 'in_corso', riaperto_at: null },
      ],
      rapportino_voci: [
        { id: 'v1', rapportino_id: 'r1', intervento_id: 'i1', template_id: 'tplPI', campi_snapshot: CAMPI_PI },
        { id: 'v3', rapportino_id: 'r3', intervento_id: 'i2', template_id: 'tplPI', campi_snapshot: CAMPI_PI },
      ],
    }));
    expect(await riagganciaVociAperte(db, NOW, { rapportiniIds: ['r1'] })).toEqual({ voci: 1 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.template_id).toBe('tplPIC');
    expect(tables.rapportino_voci.find((v) => v.id === 'v3')?.template_id).toBe('tplPI');
  });

  it('un rapportino scaduto ma appena RIAPERTO è di nuovo in mano all’operatore → riagganciato', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{ id: 'r1', template_id: 'tplX', data: '2026-08-04', stato: 'in_corso', riaperto_at: NOW }],
    }));
    expect(await riagganciaVociAperte(db, NOW, { rapportiniIds: ['r1'] })).toEqual({ voci: 1 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.campi_snapshot).toEqual(CAMPI_PICARRO);
  });

  it('rapportino scaduto (in_corso ma vecchio): l’operatore non lo ha più in mano → intatto', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{ id: 'r1', template_id: 'tplX', data: '2026-08-01', stato: 'in_corso', riaperto_at: null }],
    }));
    expect(await riagganciaVociAperte(db, NOW)).toEqual({ voci: 0 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.template_id).toBe('tplPI');
  });

  it('nessun flusso collegato attivo → niente destinazioni, niente scritture', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportino_template: [{ ...FLUSSO_PICARRO, active: false }],
    }));
    expect(await riagganciaVociAperte(db, NOW)).toEqual({ voci: 0 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.template_id).toBe('tplPI');
  });
});
