import { describe, it, expect } from 'vitest';
import { aggiornaPortaleSnapshot } from './aggiornaPortaleSnapshot';
import type { RigaOrdineAcea } from './tipi';

const riga = (over: Partial<RigaOrdineAcea>): RigaOrdineAcea =>
  ({
    odl: '957000001', numero_operazione: '0010', stato: 'COMP', stato_desc: 'completato',
    causale: 'EIES', causale_desc: 'Intervento Eseguito', esito_positivo: true,
    operatore_cognome: 'GIOSI', operatore_nome: 'VITTORIO',
    ...over,
  }) as RigaOrdineAcea;

/** Finto client: raccoglie gli upsert su `acea_portale_snapshot`. */
function fakeDb() {
  const upserts: Array<Record<string, unknown>> = [];
  const db = {
    from(tabella: string) {
      return {
        upsert(rows: Array<Record<string, unknown>>, opts: { onConflict?: string }) {
          if (tabella === 'acea_portale_snapshot' && opts.onConflict === 'odl') upserts.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, upserts };
}

const RUN = '11111111-1111-1111-1111-111111111111';

describe('aggiornaPortaleSnapshot', () => {
  it('scrive uno stato normalizzato per ODL, con causale e operatore', async () => {
    const { db, upserts } = fakeDb();
    const esito = await aggiornaPortaleSnapshot(db, [riga({ stato_desc: 'Completato' })], RUN);
    expect(esito).toEqual({ odl: 1, righe: 1 });
    expect(upserts[0]).toMatchObject({
      odl: '957000001', stato_norm: 'COMPLETATO', causa_scostamento: 'EIES',
      operatore: 'GIOSI VITTORIO', run_id: RUN,
    });
  });

  it('di un ordine con più operazioni tiene l’ULTIMA, mai il primo tentativo', async () => {
    // Lo stesso principio del motore: la 0120 di un ordine passato dodici volte porta l'esito.
    const { db, upserts } = fakeDb();
    await aggiornaPortaleSnapshot(db, [
      riga({ numero_operazione: '0010', stato_desc: 'Assegnato', causale: null }),
      riga({ numero_operazione: '0120', stato_desc: 'Completato', causale: 'EIES' }),
    ], RUN);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ stato_norm: 'COMPLETATO', causa_scostamento: 'EIES' });
  });

  it('non inventa righe: ODL vuoti scartati, file vuoto → nessuna scrittura', async () => {
    const { db, upserts } = fakeDb();
    expect(await aggiornaPortaleSnapshot(db, [], RUN)).toEqual({ odl: 0, righe: 0 });
    await aggiornaPortaleSnapshot(db, [riga({ odl: '   ' })], RUN);
    expect(upserts).toHaveLength(0);
  });

  it('tocca SOLO gli ODL del file (upsert per chiave), non cancella lo storico', async () => {
    // L'export è finestrato: cancellare ciò che non contiene perderebbe gli ordini più vecchi.
    const { db, upserts } = fakeDb();
    await aggiornaPortaleSnapshot(db, [riga({ odl: 'A' }), riga({ odl: 'B' })], RUN);
    expect(upserts.map((r) => r.odl)).toEqual(['A', 'B']);
  });

  it('operatore assente → null, non una stringa vuota', async () => {
    const { db, upserts } = fakeDb();
    await aggiornaPortaleSnapshot(db, [riga({ operatore_cognome: null, operatore_nome: null })], RUN);
    expect(upserts[0].operatore).toBeNull();
  });
});
