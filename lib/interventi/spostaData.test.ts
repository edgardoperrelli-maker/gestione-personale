// lib/interventi/spostaData.test.ts
// Fake Supabase client in-memory (chainable) per testare lo spostamento per-operatore:
// muovere il rapportino deve muovere ANCHE i suoi interventi (e solo i suoi).
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applicaSpostamentoDataRapportino } from './spostaData';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Filtro = ['eq' | 'neq', string, unknown] | ['in', string, unknown[]];

function makeFakeDb(
  seed: Tables,
  opts: { failUpdate?: { table: string; error: { message: string; code?: string } } } = {},
): { db: SupabaseClient; tables: Tables } {
  const tables: Tables = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map((r) => ({ ...r }));

  class Builder {
    table: string;
    op: 'select' | 'update' | 'delete' = 'select';
    filters: Filtro[] = [];
    patch: Row = {};
    constructor(table: string) { this.table = table; }
    select() { this.op = 'select'; return this; }
    eq(c: string, v: unknown) { this.filters.push(['eq', c, v]); return this; }
    neq(c: string, v: unknown) { this.filters.push(['neq', c, v]); return this; }
    in(c: string, v: unknown[]) { this.filters.push(['in', c, v]); return this; }
    update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
    private rows(): Row[] {
      let rows = tables[this.table] ?? [];
      for (const f of this.filters) {
        if (f[0] === 'eq') rows = rows.filter((r) => r[f[1]] === f[2]);
        else if (f[0] === 'neq') rows = rows.filter((r) => r[f[1]] !== f[2]);
        else rows = rows.filter((r) => (f[2] as unknown[]).includes(r[f[1]]));
      }
      return rows;
    }
    private exec() {
      if (this.op === 'update') {
        if (opts.failUpdate && opts.failUpdate.table === this.table) {
          return { data: null, error: opts.failUpdate.error };
        }
        for (const r of this.rows()) Object.assign(r, this.patch);
      }
      return { data: this.rows(), error: null };
    }
    then(resolve: (v: unknown) => void) { resolve(this.exec()); }
    async maybeSingle() { const r = this.rows(); return { data: r[0] ?? null, error: null }; }
  }

  const db = { from: (table: string) => new Builder(table) } as unknown as SupabaseClient;
  return { db, tables };
}

describe('applicaSpostamentoDataRapportino', () => {
  it('muove gli interventi del SOLO operatore spostato, non quelli degli altri', async () => {
    const { db, tables } = makeFakeDb({
      mappa_piani: [{ id: 'p1', data: '2026-06-19', territorio: 'ZAGAROLO' }],
      rapportini: [
        { id: 'rapA', piano_id: 'p1', staff_id: 'sA', staff_name: 'CIARALLO', data: '2026-06-19', territorio_override: null },
      ],
      interventi: [
        { id: 'i1', piano_id: 'p1', staff_id: 'sA', data: '2026-06-19' },
        { id: 'i2', piano_id: 'p1', staff_id: 'sA', data: '2026-06-19' },
        { id: 'i3', piano_id: 'p1', staff_id: 'sB', data: '2026-06-19' },
      ],
    });

    const res = await applicaSpostamentoDataRapportino(db, 'rapA', '2026-06-18');

    expect(res.ok).toBe(true);
    expect(tables.interventi.find((i) => i.id === 'i1')?.data).toBe('2026-06-18');
    expect(tables.interventi.find((i) => i.id === 'i2')?.data).toBe('2026-06-18');
    expect(tables.interventi.find((i) => i.id === 'i3')?.data).toBe('2026-06-19'); // altro operatore: intatto
    expect(tables.rapportini.find((r) => r.id === 'rapA')?.data).toBe('2026-06-18');
  });

  it('riallinea gli interventi rimasti indietro anche se il rapportino è già sul giorno (self-heal)', async () => {
    const { db, tables } = makeFakeDb({
      mappa_piani: [{ id: 'p1', data: '2026-06-19', territorio: 'ZAGAROLO' }],
      rapportini: [
        { id: 'rapA', piano_id: 'p1', staff_id: 'sA', staff_name: 'CIARALLO', data: '2026-06-18', territorio_override: null },
      ],
      interventi: [
        { id: 'i1', piano_id: 'p1', staff_id: 'sA', data: '2026-06-19' }, // rimasto al giorno vecchio
        { id: 'i2', piano_id: 'p1', staff_id: 'sA', data: '2026-06-18' },
      ],
    });

    const res = await applicaSpostamentoDataRapportino(db, 'rapA', '2026-06-18');

    expect(res.ok).toBe(true);
    expect(tables.interventi.find((i) => i.id === 'i1')?.data).toBe('2026-06-18'); // riallineato
    expect(tables.interventi.find((i) => i.id === 'i2')?.data).toBe('2026-06-18');
  });

  it('blocca con 409 se l operatore è già pianificato in quel territorio in un altro piano', async () => {
    const { db } = makeFakeDb({
      mappa_piani: [
        { id: 'p1', data: '2026-06-19', territorio: 'ZAGAROLO' },
        { id: 'p2', data: '2026-06-18', territorio: 'ZAGAROLO' },
      ],
      rapportini: [
        { id: 'rapA', piano_id: 'p1', staff_id: 'sA', staff_name: 'CIARALLO', data: '2026-06-19', territorio_override: null },
        { id: 'rapB', piano_id: 'p2', staff_id: 'sA', staff_name: 'CIARALLO', data: '2026-06-18', stato: 'in_corso', submitted_at: null, territorio_override: null },
      ],
      interventi: [],
    });

    const res = await applicaSpostamentoDataRapportino(db, 'rapA', '2026-06-18');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it('su collisione indice dedup (committente,odl,data) ritorna 409 e NON sposta il rapportino', async () => {
    const { db, tables } = makeFakeDb({
      mappa_piani: [{ id: 'p1', data: '2026-06-19', territorio: 'ZAGAROLO' }],
      rapportini: [
        { id: 'rapA', piano_id: 'p1', staff_id: 'sA', staff_name: 'CIARALLO', data: '2026-06-19', territorio_override: null },
      ],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 'sA', data: '2026-06-19', odl: 'ODL1' }],
    }, {
      failUpdate: { table: 'interventi', error: { message: 'duplicate key value violates unique constraint "interventi_dedup_idx"', code: '23505' } },
    });

    const res = await applicaSpostamentoDataRapportino(db, 'rapA', '2026-06-18');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
    // coerenza: il rapportino NON è stato spostato (l'update interventi è prima)
    expect(tables.rapportini.find((r) => r.id === 'rapA')?.data).toBe('2026-06-19');
    // gli interventi restano fermi (l'update è fallito)
    expect(tables.interventi.find((i) => i.id === 'i1')?.data).toBe('2026-06-19');
  });
});
