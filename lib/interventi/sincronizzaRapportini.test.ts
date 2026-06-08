// lib/interventi/sincronizzaRapportini.test.ts
// Test del motore di (ri)generazione rapportini. Usa un fake Supabase client in-memory
// (chainable) e mocka ensureInterventiForPiano per isolare l'orchestrazione del motore.
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/interventi/ensureInterventiForPiano', () => ({
  ensureInterventiForPiano: vi.fn(async () => ({ creati: 0, preservati: 0, scartati: 0 })),
}));

import { sincronizzaRapportini, isInterventoFkError } from './sincronizzaRapportini';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Filtro = ['eq' | 'neq', string, unknown] | ['in', string, unknown[]];

/** Fake Supabase client: simula le tabelle in memoria con le query chain usate dal motore. */
function makeFakeDb(seed: Tables, opts: { failVociInsertOnce?: string } = {}): { db: SupabaseClient; tables: Tables } {
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

function seedBase(over: Partial<Tables> = {}): Tables {
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

const OPTS = { templateId: 'tpl1' };

describe('sincronizzaRapportini', () => {
  it('riusa lo stesso token per un operatore con rapportino esistente', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rapportini[0].token).toBe('TOK1');
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.token).toBe('TOK1');
  });

  it('preserva le risposte già compilate per i task che restano', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', risposte: { q: 'A' }, raw_json: {} }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce?.risposte).toEqual({ q: 'A' });
  });

  it('crea un nuovo token per un operatore senza rapportino', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's3', staff_name: 'Giovanni', tasks: [{ id: 't9', odl: 'ODL9' }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.rapportini[0].token).toBe('string');
    if (res.ok) expect(res.rapportini[0].token.length).toBeGreaterThan(0);
    expect(tables.rapportini.find((r) => r.staff_id === 's3')).toBeTruthy();
  });

  it('riapre un rapportino inviato SOLO con confermaInviati', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', confermaInviati: true });
    expect(res.ok).toBe(true);
    const rap = tables.rapportini.find((r) => r.id === 'rap1');
    expect(rap?.stato).toBe('in_corso');
    expect(rap?.riaperto_at).toBeTruthy();
  });

  it('NON riapre un rapportino inviato senza conferma', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const rap = tables.rapportini.find((r) => r.id === 'rap1');
    expect(rap?.stato).toBe('inviato');
    expect(rap?.riaperto_at).toBeFalsy();
  });

  it('rifiuta lo spostamento di un intervento completato (409)', async () => {
    // intervento ODL1 completato sotto s1, ma proposto sotto s2 → spostamento illecito
    const { db } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's2', staff_name: 'Luigi', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'completato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error).toMatch(/^spostamento_completato:/);
    }
  });
});

describe('isInterventoFkError', () => {
  it('riconosce la FK su rapportino_voci.intervento_id', () => {
    expect(isInterventoFkError('insert or update on table "rapportino_voci" violates foreign key constraint "rapportino_voci_intervento_id_fkey"')).toBe(true);
  });
  it('ignora altri errori e valori vuoti', () => {
    expect(isInterventoFkError('altro errore qualsiasi')).toBe(false);
    expect(isInterventoFkError(null)).toBe(false);
    expect(isInterventoFkError(undefined)).toBe(false);
  });
});

describe('sincronizzaRapportini — fallback FK su race', () => {
  it("se l'insert voci va in FK violation, salva le voci SENZA collegamento e non fallisce", async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato' }],
    }), { failVociInsertOnce: 'violates foreign key constraint "rapportino_voci_intervento_id_fkey"' });
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce).toBeTruthy();
    expect(voce?.intervento_id ?? null).toBeNull();
  });
});
