// lib/interventi/territorioOverride.test.ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  risolviTerritorioDestinazione,
  reapplyOverridesPlan,
  applicaSpostamentoTerritorio,
  reapplyOverridesInterventi,
} from './territorioOverride';

const idByName = new Map<string, string>([
  ['acea', 'id-acea'],
  ['firenze', 'id-firenze'],
]);

describe('risolviTerritorioDestinazione', () => {
  it('nome valido → override = nome, id risolto (case-insensitive)', () => {
    const r = risolviTerritorioDestinazione('ACEA', 'Firenze', idByName);
    expect(r).toEqual({ ok: true, override: 'ACEA', territorioId: 'id-acea' });
  });
  it('nome non trovato → errore', () => {
    const r = risolviTerritorioDestinazione('Marte', 'Firenze', idByName);
    expect(r.ok).toBe(false);
  });
  it('vuoto/null → ripristino: override null, destinazione = territorio piano', () => {
    expect(risolviTerritorioDestinazione(null, 'Firenze', idByName))
      .toEqual({ ok: true, override: null, territorioId: 'id-firenze' });
    expect(risolviTerritorioDestinazione('  ', 'Sconosciuto', idByName))
      .toEqual({ ok: true, override: null, territorioId: null });
  });
});

describe('reapplyOverridesPlan', () => {
  it('produce update solo per gli override risolvibili', () => {
    const updates = reapplyOverridesPlan(
      [
        { staff_id: 's1', territorio_override: 'ACEA' },
        { staff_id: 's2', territorio_override: null },
        { staff_id: 's3', territorio_override: 'Marte' }, // non risolvibile → scartato
      ],
      idByName,
    );
    expect(updates).toEqual([{ staffId: 's1', territorioId: 'id-acea' }]);
  });
});

// ── Orchestrazioni db (fake in-memory) ───────────────────────────────────────
type Row = Record<string, unknown>;
function fakeDb(seed: Record<string, Row[]>): { db: SupabaseClient; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = {};
  for (const k of Object.keys(seed)) tables[k] = seed[k].map((r) => ({ ...r }));
  class B {
    table: string;
    op: 'select' | 'update' = 'select';
    patch: Row = {};
    filters: Array<['eq', string, unknown] | ['notnull', string]> = [];
    constructor(t: string) { this.table = t; }
    select() { this.op = 'select'; return this; }
    update(p: Row) { this.op = 'update'; this.patch = p; return this; }
    eq(c: string, v: unknown) { this.filters.push(['eq', c, v]); return this; }
    not(...args: unknown[]) { this.filters.push(['notnull', String(args[0])]); return this; }
    private rows() {
      let rows = tables[this.table] ?? [];
      for (const f of this.filters) {
        if (f[0] === 'eq') rows = rows.filter((r) => r[f[1]] === f[2]);
        else rows = rows.filter((r) => r[f[1]] != null);
      }
      return rows;
    }
    async maybeSingle() { return { data: this.rows()[0] ?? null, error: null }; }
    then(res: (v: { data: Row[]; error: null }) => void) {
      if (this.op === 'update') { for (const r of this.rows()) Object.assign(r, this.patch); res({ data: [], error: null }); return; }
      res({ data: this.rows(), error: null });
    }
  }
  return { db: { from: (t: string) => new B(t) } as unknown as SupabaseClient, tables };
}

const seed = () => ({
  rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', territorio_override: null as string | null }],
  mappa_piani: [{ id: 'p1', territorio: 'Firenze' }],
  territories: [{ id: 'id-acea', name: 'ACEA' }, { id: 'id-firenze', name: 'Firenze' }],
  interventi: [
    { id: 'i1', piano_id: 'p1', staff_id: 's1', territorio_id: 'id-firenze' },
    { id: 'i2', piano_id: 'p1', staff_id: 's2', territorio_id: 'id-firenze' },
  ],
});

describe('applicaSpostamentoTerritorio', () => {
  it("sposta: imposta override e aggiorna SOLO gli interventi dell'operatore", async () => {
    const { db, tables } = fakeDb(seed());
    const res = await applicaSpostamentoTerritorio(db, 'rap1', 'ACEA');
    expect(res.ok).toBe(true);
    expect(tables.rapportini[0].territorio_override).toBe('ACEA');
    expect(tables.interventi.find((i) => i.id === 'i1')?.territorio_id).toBe('id-acea');
    expect(tables.interventi.find((i) => i.id === 'i2')?.territorio_id).toBe('id-firenze');
  });

  it('ripristino (null): override null e interventi tornano al territorio del piano', async () => {
    const seeded = seed();
    seeded.rapportini[0].territorio_override = 'ACEA';
    seeded.interventi[0].territorio_id = 'id-acea';
    const { db, tables } = fakeDb(seeded);
    const res = await applicaSpostamentoTerritorio(db, 'rap1', null);
    expect(res.ok).toBe(true);
    expect(tables.rapportini[0].territorio_override).toBeNull();
    expect(tables.interventi.find((i) => i.id === 'i1')?.territorio_id).toBe('id-firenze');
  });

  it('rapportino inesistente → 404', async () => {
    const { db } = fakeDb(seed());
    const res = await applicaSpostamentoTerritorio(db, 'nope', 'ACEA');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('territorio inesistente → 400', async () => {
    const { db } = fakeDb(seed());
    const res = await applicaSpostamentoTerritorio(db, 'rap1', 'Marte');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });
});

describe('reapplyOverridesInterventi', () => {
  it('ri-allinea le righe interventi agli override del piano', async () => {
    const seeded = seed();
    seeded.rapportini[0].territorio_override = 'ACEA'; // s1 spostato in ACEA
    // simula la rigenerazione: interventi tornati tutti a Firenze
    seeded.interventi[0].territorio_id = 'id-firenze';
    const { db, tables } = fakeDb(seeded);
    await reapplyOverridesInterventi(db, 'p1');
    expect(tables.interventi.find((i) => i.id === 'i1')?.territorio_id).toBe('id-acea');
    expect(tables.interventi.find((i) => i.id === 'i2')?.territorio_id).toBe('id-firenze');
  });

  it('nessun override → nessuna modifica', async () => {
    const { db, tables } = fakeDb(seed());
    await reapplyOverridesInterventi(db, 'p1');
    expect(tables.interventi.find((i) => i.id === 'i1')?.territorio_id).toBe('id-firenze');
  });
});
