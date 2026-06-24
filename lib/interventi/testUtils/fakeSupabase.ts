// lib/interventi/testUtils/fakeSupabase.ts
// Fake Supabase client in-memory (chainable) condiviso dai test del motore rapportini.
// Estratto da sincronizzaRapportini.test.ts per riuso (vedi rigeneraPiano.test.ts).
import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Filtro = ['eq' | 'neq', string, unknown] | ['in', string, unknown[]];

/** Fake Supabase client: simula le tabelle in memoria con le query chain usate dal motore. */
export function makeFakeDb(seed: Tables, opts: { failVociInsertOnce?: string } = {}): { db: SupabaseClient; tables: Tables } {
  const tables: Tables = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map((r) => ({ ...r }));
  let counter = 0;
  const genId = () => `gen_${++counter}`;
  let failVociPending: string | null = opts.failVociInsertOnce ?? null;

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
    delete() { this.op = 'delete'; return this; }

    private rows(): Row[] {
      let rows = tables[this.table] ?? [];
      for (const f of this.filters) {
        if (f[0] === 'eq') rows = rows.filter((r) => r[f[1]] === f[2]);
        else if (f[0] === 'neq') rows = rows.filter((r) => r[f[1]] !== f[2]);
        else rows = rows.filter((r) => (f[2] as unknown[]).includes(r[f[1]]));
      }
      return rows;
    }

    private exec(): { data: Row[]; error: null } | { error: null } {
      if (this.op === 'select') return { data: this.rows(), error: null };
      if (this.op === 'update') { for (const r of this.rows()) Object.assign(r, this.patch); return { error: null }; }
      const toDel = new Set(this.rows());
      tables[this.table] = (tables[this.table] ?? []).filter((r) => !toDel.has(r));
      return { error: null };
    }

    // thenable: await builder → esegue (select/update/delete)
    then(resolve: (v: unknown) => void) { resolve(this.exec()); }
    async single() { const r = this.rows(); return { data: r[0] ?? null, error: null }; }
    async maybeSingle() { const r = this.rows(); return { data: r[0] ?? null, error: null }; }

    insert(rows: Row | Row[]) {
      const arr = Array.isArray(rows) ? rows : [rows];
      if (this.table === 'rapportino_voci' && failVociPending && arr.some((r) => r.intervento_id != null)) {
        const message = failVociPending;
        failVociPending = null; // consuma: il retry (intervento_id null) passa
        return { then: (resolve: (v: unknown) => void) => resolve({ error: { message } }) };
      }
      const inserted = arr.map((r) => { const row: Row = { ...r, id: (r.id as string | undefined) ?? genId() }; (tables[this.table] ??= []).push(row); return row; });
      return {
        select: () => ({ single: async () => ({ data: { id: inserted[0].id }, error: null }) }),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
    }
  }

  const db = { from: (table: string) => new Builder(table) } as unknown as SupabaseClient;
  return { db, tables };
}

export function seedBase(over: Partial<Tables> = {}): Tables {
  return {
    mappa_piani: [{ id: 'p1', data: '2026-06-10', territorio: 'TERR' }],
    rapportino_template: [{ id: 'tpl1', campi: [], info_campi: [] }],
    mappa_piani_operatori: [],
    rapportini: [],
    rapportino_voci: [],
    interventi: [],
    ...over,
  };
}
