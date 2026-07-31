import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { caricaRapportiniEsistenti } from './caricaRapportiniEsistenti';

type Row = Record<string, unknown>;

/**
 * Fake minimo che si comporta come PostgREST su una colonna `uuid`: un `null` dentro `in.(…)`
 * viaggia come la STRINGA "null" e Postgres alza 22P02. Accettarlo in silenzio renderebbe verde
 * proprio il test che deve tenere chiusa questa regressione.
 */
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  class B {
    constructor(private t: string) {}
    private f: Array<[string, string, unknown]> = [];
    select() { return this; }
    eq(c: string, v: unknown) { this.f.push(['eq', c, v]); return this; }
    in(c: string, v: unknown[]) {
      if (v.some((x) => x == null)) {
        throw new Error(`invalid input syntax for type uuid: "null" (colonna ${c})`);
      }
      this.f.push(['in', c, v]);
      return this;
    }
    private rows(): Row[] {
      let rows = tables[this.t] ?? [];
      for (const [op, c, v] of this.f) {
        rows = op === 'eq' ? rows.filter((r) => r[c] === v) : rows.filter((r) => (v as unknown[]).includes(r[c]));
      }
      return rows;
    }
    then(resolve: (v: unknown) => void) { resolve({ data: this.rows(), error: null }); }
  }
  return { from: (t: string) => new B(t) } as unknown as SupabaseClient;
}

const RAPPORTINI = [
  { id: 'r1', staff_id: 's1', piano_id: 'p1', data: '2026-07-31', stato: 'in_corso', submitted_at: null },
  // Rapportino-contenitore della Consuntivazione: nessun piano dietro.
  { id: 'r2', staff_id: 's1', piano_id: null, data: '2026-07-31', stato: 'inviato', submitted_at: '2026-07-31T10:20:00Z' },
];

describe('caricaRapportiniEsistenti', () => {
  it('un rapportino senza piano non fa fallire la lettura dei piani', async () => {
    const db = fakeDb({
      rapportini: RAPPORTINI,
      mappa_piani: [{ id: 'p1', territorio: 'LAZIO EST' }],
    });
    const out = await caricaRapportiniEsistenti(db, '2026-07-31', ['s1']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'r1', piano_id: 'p1', territorio: 'LAZIO EST' });
  });

  it('i rapportini senza piano restano fuori: senza territorio non generano conflitti', async () => {
    const db = fakeDb({ rapportini: RAPPORTINI, mappa_piani: [{ id: 'p1', territorio: 'LAZIO EST' }] });
    const out = await caricaRapportiniEsistenti(db, '2026-07-31', ['s1']);
    expect(out.map((r) => r.id)).not.toContain('r2');
  });

  it('SOLO rapportini senza piano → nessuna query sui piani, lista vuota', async () => {
    const db = fakeDb({ rapportini: [RAPPORTINI[1]], mappa_piani: [] });
    await expect(caricaRapportiniEsistenti(db, '2026-07-31', ['s1'])).resolves.toEqual([]);
  });
});
