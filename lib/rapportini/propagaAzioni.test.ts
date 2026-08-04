// lib/rapportini/propagaAzioni.test.ts
// La modifica delle azioni in «Azioni operatori» deve raggiungere i rapportini ancora in
// mano agli operatori (snapshot riallineati) senza toccare inviati e scaduti.
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeFakeDb, type Tables } from '@/lib/interventi/testUtils/fakeSupabase';
import { propagaAzioniAiRapportiniAperti } from './propagaAzioni';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const NOW = '2026-08-04T10:00:00Z';
const OGGI = '2026-08-04';

const CAMPI_NUOVI: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO', 'NESSUN PASSAGGIO'], obbligatoria: true, ordine: 1 },
];
const CAMPI_VECCHI: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true, ordine: 1 },
];

function seed(over: Partial<Tables> = {}): Tables {
  return { rapportini: [], rapportino_voci: [], ...over };
}

describe('propagaAzioniAiRapportiniAperti', () => {
  it('riallinea lo snapshot dei rapportini compilabili col flusso come modello, non inviati né scaduti', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [
        { id: 'r1', template_id: 'tpl1', data: OGGI, stato: 'in_corso', riaperto_at: null, campi_snapshot: CAMPI_VECCHI },
        { id: 'r2', template_id: 'tpl1', data: OGGI, stato: 'inviato', riaperto_at: null, campi_snapshot: CAMPI_VECCHI },
        // in_corso ma di tre giorni fa → link scaduto: l'operatore non lo ha più in mano.
        { id: 'r3', template_id: 'tpl1', data: '2026-08-01', stato: 'in_corso', riaperto_at: null, campi_snapshot: CAMPI_VECCHI },
        // compilabile ma con un altro modello: non è affare di questo flusso.
        { id: 'r4', template_id: 'tplX', data: OGGI, stato: 'in_corso', riaperto_at: null, campi_snapshot: CAMPI_VECCHI },
      ],
    }));
    const esito = await propagaAzioniAiRapportiniAperti(db, 'tpl1', CAMPI_NUOVI, NOW);
    expect(esito).toEqual({ rapportini: 1, voci: 0 });
    expect(tables.rapportini.find((r) => r.id === 'r1')?.campi_snapshot).toEqual(CAMPI_NUOVI);
    expect(tables.rapportini.find((r) => r.id === 'r2')?.campi_snapshot).toEqual(CAMPI_VECCHI);
    expect(tables.rapportini.find((r) => r.id === 'r3')?.campi_snapshot).toEqual(CAMPI_VECCHI);
    expect(tables.rapportini.find((r) => r.id === 'r4')?.campi_snapshot).toEqual(CAMPI_VECCHI);
  });

  it('riallinea le voci agganciate al flusso anche dentro rapportini con altro modello (misti)', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [
        { id: 'r1', template_id: 'tplX', data: OGGI, stato: 'in_corso', riaperto_at: null, campi_snapshot: [] },
        { id: 'r2', template_id: 'tplX', data: OGGI, stato: 'inviato', riaperto_at: null, campi_snapshot: [] },
      ],
      rapportino_voci: [
        { id: 'v1', rapportino_id: 'r1', template_id: 'tpl1', campi_snapshot: CAMPI_VECCHI },
        // stesso rapportino, flusso diverso: intatta.
        { id: 'v2', rapportino_id: 'r1', template_id: 'tplX', campi_snapshot: CAMPI_VECCHI },
        // rapportino già inviato: intatta anche se la voce è di questo flusso.
        { id: 'v3', rapportino_id: 'r2', template_id: 'tpl1', campi_snapshot: CAMPI_VECCHI },
      ],
    }));
    const esito = await propagaAzioniAiRapportiniAperti(db, 'tpl1', CAMPI_NUOVI, NOW);
    expect(esito).toEqual({ rapportini: 0, voci: 1 });
    expect(tables.rapportino_voci.find((v) => v.id === 'v1')?.campi_snapshot).toEqual(CAMPI_NUOVI);
    expect(tables.rapportino_voci.find((v) => v.id === 'v2')?.campi_snapshot).toEqual(CAMPI_VECCHI);
    expect(tables.rapportino_voci.find((v) => v.id === 'v3')?.campi_snapshot).toEqual(CAMPI_VECCHI);
  });

  it('un rapportino vecchio ma riaperto da poco è ancora in mano all’operatore → riallineato', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [
        { id: 'r1', template_id: 'tpl1', data: '2026-07-20', stato: 'in_corso', riaperto_at: '2026-08-04T08:00:00Z', campi_snapshot: CAMPI_VECCHI },
      ],
    }));
    const esito = await propagaAzioniAiRapportiniAperti(db, 'tpl1', CAMPI_NUOVI, NOW);
    expect(esito).toEqual({ rapportini: 1, voci: 0 });
    expect(tables.rapportini[0].campi_snapshot).toEqual(CAMPI_NUOVI);
  });

  it('senza rapportini compilabili non tocca niente', async () => {
    const { db } = makeFakeDb(seed({
      rapportini: [{ id: 'r1', template_id: 'tpl1', data: OGGI, stato: 'inviato', riaperto_at: null, campi_snapshot: CAMPI_VECCHI }],
    }));
    await expect(propagaAzioniAiRapportiniAperti(db, 'tpl1', CAMPI_NUOVI, NOW)).resolves.toEqual({ rapportini: 0, voci: 0 });
  });

  it('colonne per-voce non ancora migrate: propaga il livello rapportino e non lancia', async () => {
    const { db, tables } = makeFakeDb(seed({
      rapportini: [{ id: 'r1', template_id: 'tpl1', data: OGGI, stato: 'in_corso', riaperto_at: null, campi_snapshot: CAMPI_VECCHI }],
    }));
    const origFrom = (db as unknown as { from: (t: string) => unknown }).from.bind(db);
    const dbSenzaColonne = {
      from: (t: string) => {
        if (t !== 'rapportino_voci') return origFrom(t);
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: null,
                error: { code: '42703', message: 'column rapportino_voci.template_id does not exist' },
              }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;
    const esito = await propagaAzioniAiRapportiniAperti(dbSenzaColonne, 'tpl1', CAMPI_NUOVI, NOW);
    expect(esito).toEqual({ rapportini: 1, voci: 0 });
    expect(tables.rapportini[0].campi_snapshot).toEqual(CAMPI_NUOVI);
  });
});
